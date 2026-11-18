import hashlib
import io
import logging
import os
from pathlib import Path
import urllib.parse
import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Query, status
from fastapi.responses import Response
from PIL import Image
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.core.config import settings
from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import SourceAsset, ProcessingJob, ItemSource, LibraryItem, ImageDerivative, IdentificationCandidate
from app.schemas.common import (
    AssetUploadResponse,
    BatchUploadResponse,
    SourceAssetResponse,
    SourceAssetListResponse,
    SourceAssetDetailResponse,
    ProcessingJobResponse,
    LinkedLibraryItem,
)
from app.adapters.storage import get_storage_adapter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assets", tags=["Source Assets"])

ALLOWED_MIME_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB


def process_image_file(file_bytes: bytes, filename: str) -> tuple[int, int, str]:
    """Validate image magic bytes with Pillow and return width, height, and verified format."""
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()
        # Re-open after verify() closes/resets the file
        img = Image.open(io.BytesIO(file_bytes))
        width, height = img.size
        format_lower = img.format.lower() if img.format else "png"
        return width, height, format_lower
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded file '{filename}' is not a valid or readable image: {str(e)}"
        )


@router.post("/upload", response_model=BatchUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_assets(
    files: List[UploadFile] = File(...),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    force_reupload: bool = Query(False, description="Force new upload even if identical hash exists"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")

    storage = get_storage_adapter()
    results: List[AssetUploadResponse] = []

    # 1. Check idempotency key if provided (single request replay protection)
    if idempotency_key:
        existing_asset = db.query(SourceAsset).filter(
            SourceAsset.user_id == current_user.id,
            SourceAsset.idempotency_key == idempotency_key
        ).first()
        if existing_asset:
            latest_job = db.query(ProcessingJob).filter(
                ProcessingJob.source_asset_id == existing_asset.id,
                ProcessingJob.user_id == current_user.id
            ).order_by(ProcessingJob.created_at.desc()).first()
            return BatchUploadResponse(
                assets=[
                    AssetUploadResponse(
                        asset_id=existing_asset.id,
                        file_name=existing_asset.file_name,
                        sha256_hash=existing_asset.sha256_hash,
                        file_size_bytes=existing_asset.file_size_bytes,
                        mime_type=existing_asset.mime_type,
                        job_id=latest_job.id if latest_job else "",
                        status=latest_job.status if latest_job else "awaiting_identification",
                        is_duplicate=True
                    )
                ],
                total_count=1
            )

    for upload_file in files:
        content = await upload_file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File '{upload_file.filename}' exceeds maximum allowed size of 15MB"
            )

        # Validate with Pillow
        width, height, img_format = process_image_file(content, upload_file.filename or "unknown")

        # Determine MIME type
        mime_type = upload_file.content_type or f"image/{img_format}"
        if mime_type not in ALLOWED_MIME_TYPES:
            mime_type = f"image/{img_format}"

        # Compute SHA-256
        sha256_hash = hashlib.sha256(content).hexdigest()

        # Deduplication check by SHA-256 (unless force_reupload is requested)
        if not force_reupload:
            existing_hash_asset = db.query(SourceAsset).filter(
                SourceAsset.user_id == current_user.id,
                SourceAsset.sha256_hash == sha256_hash
            ).first()
            if existing_hash_asset:
                latest_job = db.query(ProcessingJob).filter(
                    ProcessingJob.source_asset_id == existing_hash_asset.id,
                    ProcessingJob.user_id == current_user.id
                ).order_by(ProcessingJob.created_at.desc()).first()
                results.append(AssetUploadResponse(
                    asset_id=existing_hash_asset.id,
                    file_name=existing_hash_asset.file_name,
                    sha256_hash=existing_hash_asset.sha256_hash,
                    file_size_bytes=existing_hash_asset.file_size_bytes,
                    mime_type=existing_hash_asset.mime_type,
                    job_id=latest_job.id if latest_job else "",
                    status=latest_job.status if latest_job else "awaiting_identification",
                    is_duplicate=True
                ))
                continue

        # Asset ID & Storage path
        asset_id = str(uuid.uuid4())
        ext = ALLOWED_MIME_TYPES.get(mime_type, f".{img_format}")
        storage_path = f"screenshots/{current_user.id}/{asset_id}{ext}"

        # Upload original file to private storage
        stored_path = await storage.upload_file(storage_path, content, mime_type)

        try:
            # Create source asset record
            asset = SourceAsset(
                id=asset_id,
                user_id=current_user.id,
                file_path=stored_path,
                file_name=upload_file.filename or f"screenshot{ext}",
                file_size_bytes=len(content),
                mime_type=mime_type,
                sha256_hash=sha256_hash,
                image_width=width,
                image_height=height,
                idempotency_key=idempotency_key
            )
            db.add(asset)

            # Create processing job record in 'awaiting_identification' state for M2
            job_id = str(uuid.uuid4())
            job = ProcessingJob(
                id=job_id,
                user_id=current_user.id,
                source_asset_id=asset_id,
                status="awaiting_identification"
            )
            db.add(job)
            db.commit()
        except Exception as e:
            db.rollback()
            # Attempt storage cleanup if DB persistence failed
            try:
                await storage.delete_file(stored_path)
            except Exception as cleanup_err:
                logger.critical(
                    "ORPHANED_STORAGE_OBJECT: Failed to clean up file after DB rollback: "
                    f"path='{stored_path}', user='{current_user.id}', error='{cleanup_err}'"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist asset record: {str(e)}"
            )

        results.append(AssetUploadResponse(
            asset_id=asset_id,
            file_name=asset.file_name,
            sha256_hash=sha256_hash,
            file_size_bytes=asset.file_size_bytes,
            mime_type=mime_type,
            job_id=job_id,
            status="awaiting_identification",
            is_duplicate=False
        ))

    return BatchUploadResponse(assets=results, total_count=len(results))


@router.get("", response_model=SourceAssetListResponse)
async def list_source_assets(
    search: Optional[str] = Query(None, description="Search by file name"),
    status: Optional[str] = Query(None, description="Filter by job status"),
    sort: str = Query("newest", pattern="^(newest|oldest)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List private source screenshots for the authenticated user."""
    query = db.query(SourceAsset).filter(SourceAsset.user_id == current_user.id)

    if search:
        query = query.filter(SourceAsset.file_name.ilike(f"%{search}%"))

    if status:
        query = query.join(ProcessingJob, SourceAsset.id == ProcessingJob.source_asset_id).filter(
            ProcessingJob.status == status
        )

    total = query.count()

    if sort == "oldest":
        query = query.order_by(asc(SourceAsset.created_at))
    else:
        query = query.order_by(desc(SourceAsset.created_at))

    assets = query.offset(offset).limit(limit).all()
    storage = get_storage_adapter()
    items: List[SourceAssetResponse] = []

    for a in assets:
        signed_url = await storage.get_signed_url(a.file_path, expires_in_seconds=900)
        latest_job = db.query(ProcessingJob).filter(
            ProcessingJob.source_asset_id == a.id,
            ProcessingJob.user_id == current_user.id
        ).order_by(ProcessingJob.created_at.desc()).first()

        items.append(
            SourceAssetResponse(
                id=a.id,
                file_name=a.file_name,
                file_path=a.file_path,
                file_size_bytes=a.file_size_bytes,
                mime_type=a.mime_type,
                sha256_hash=a.sha256_hash,
                image_width=a.image_width,
                image_height=a.image_height,
                idempotency_key=a.idempotency_key,
                signed_url=signed_url,
                latest_status=latest_job.status if latest_job else None,
                created_at=a.created_at
            )
        )

    return SourceAssetListResponse(total=total, items=items)


@router.get("/{asset_id}", response_model=SourceAssetDetailResponse)
async def get_asset(
    asset_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    asset = db.query(SourceAsset).filter(
        SourceAsset.id == asset_id,
        SourceAsset.user_id == current_user.id
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source asset not found")

    storage = get_storage_adapter()
    signed_url = await storage.get_signed_url(asset.file_path, expires_in_seconds=900)

    latest_job = db.query(ProcessingJob).filter(
        ProcessingJob.source_asset_id == asset.id,
        ProcessingJob.user_id == current_user.id
    ).order_by(ProcessingJob.created_at.desc()).first()

    # Associated library items via ItemSource junction
    linked_items = (
        db.query(LibraryItem)
        .join(ItemSource, LibraryItem.id == ItemSource.library_item_id)
        .filter(ItemSource.source_asset_id == asset.id, LibraryItem.user_id == current_user.id)
        .all()
    )

    return SourceAssetDetailResponse(
        id=asset.id,
        file_name=asset.file_name,
        file_path=asset.file_path,
        file_size_bytes=asset.file_size_bytes,
        mime_type=asset.mime_type,
        sha256_hash=asset.sha256_hash,
        image_width=asset.image_width,
        image_height=asset.image_height,
        idempotency_key=asset.idempotency_key,
        signed_url=signed_url,
        latest_status=latest_job.status if latest_job else None,
        created_at=asset.created_at,
        latest_job=ProcessingJobResponse.model_validate(latest_job) if latest_job else None,
        library_items=[
            LinkedLibraryItem(
                id=item.id,
                title=item.title,
                creator=item.creator,
                content_type=item.content_type,
                consumption_status=item.consumption_status,
                created_at=item.created_at
            )
            for item in linked_items
        ]
    )


@router.get("/{asset_id}/url")
async def get_asset_signed_url(
    asset_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    asset = db.query(SourceAsset).filter(
        SourceAsset.id == asset_id,
        SourceAsset.user_id == current_user.id
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source asset not found")

    storage = get_storage_adapter()
    signed_url = await storage.get_signed_url(asset.file_path, expires_in_seconds=900)
    return {
        "asset_id": asset.id,
        "signed_url": signed_url,
        "expires_in_seconds": 900
    }


@router.delete("/{asset_id}", status_code=status.HTTP_200_OK)
async def delete_asset(
    asset_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a source screenshot asset, associated jobs, candidates, and storage object."""
    asset = db.query(SourceAsset).filter(
        SourceAsset.id == asset_id,
        SourceAsset.user_id == current_user.id
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source asset not found")

    storage = get_storage_adapter()

    # 1. Delete associated item sources links
    db.query(ItemSource).filter(ItemSource.source_asset_id == asset_id).delete(synchronize_session=False)

    # 2. Delete candidates and their derivatives
    candidates = db.query(IdentificationCandidate).filter(IdentificationCandidate.source_asset_id == asset_id).all()
    for cand in candidates:
        if cand.derivative_id:
            deriv = db.query(ImageDerivative).filter(ImageDerivative.id == cand.derivative_id).first()
            if deriv:
                try:
                    await storage.delete_file(deriv.storage_path)
                except Exception:
                    pass
                db.delete(deriv)
        db.delete(cand)

    # 3. Delete processing jobs
    db.query(ProcessingJob).filter(ProcessingJob.source_asset_id == asset_id).delete(synchronize_session=False)

    # 4. Delete physical file from storage
    try:
        await storage.delete_file(asset.file_path)
    except Exception as e:
        logger.warning(f"Could not delete physical storage file {asset.file_path}: {e}")

    # 5. Delete asset record
    db.delete(asset)
    db.commit()

    return {"success": True, "message": f"Asset '{asset.file_name}' deleted successfully", "asset_id": asset_id}


@router.get("/media/{file_path:path}")
async def serve_local_media(
    file_path: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Local development only endpoint to serve stored media files with strict user isolation."""
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not available in production")

    # 1. Decode URL encoding recursively (handles encoded %2e%2e%2f, %252e%252e, etc.)
    decoded_path = file_path
    for _ in range(5):
        unquoted = urllib.parse.unquote(decoded_path)
        if unquoted == decoded_path:
            break
        decoded_path = unquoted

    # 2. Canonical resolution against storage root
    storage_root = Path(settings.LOCAL_STORAGE_PATH).resolve()
    user_storage_root = (storage_root / "screenshots" / current_user.id).resolve()

    clean_subpath = decoded_path.lstrip("/\\").replace("\\", "/")
    target_path = (storage_root / clean_subpath).resolve()

    # 3. Enforce that the canonical resolved path is strictly within the user's storage root
    if not target_path.is_relative_to(user_storage_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: cannot access assets belonging to another user",
        )

    # 4. Check for symlink escapes: resolved target must remain within user_storage_root
    try:
        real_target = target_path.resolve(strict=True)
        if not real_target.is_relative_to(user_storage_root):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: symlink points outside user storage boundary",
            )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    # 5. Database ownership check: verify the file is a registered SourceAsset or ImageDerivative owned by user
    rel_storage_path = str(target_path.relative_to(storage_root)).replace("\\", "/")
    asset_match = db.query(SourceAsset).filter(
        SourceAsset.user_id == current_user.id,
        SourceAsset.file_path == rel_storage_path,
    ).first()
    if not asset_match:
        derivative_match = db.query(ImageDerivative).filter(
            ImageDerivative.user_id == current_user.id,
            ImageDerivative.storage_path == rel_storage_path,
        ).first()
        if not derivative_match:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: requested file is not a registered asset owned by this user",
            )

    storage = get_storage_adapter()
    try:
        data = await storage.download_file(rel_storage_path)
        mime = "image/png" if rel_storage_path.endswith(".png") else "image/jpeg"
        return Response(content=data, media_type=mime)
    except (FileNotFoundError, PermissionError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@router.get("/{asset_id}/file")
async def download_asset_file(
    asset_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Secure direct download of source screenshot by asset ID enforcing database ownership."""
    asset = db.query(SourceAsset).filter(
        SourceAsset.id == asset_id,
        SourceAsset.user_id == current_user.id,
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source asset not found")

    storage = get_storage_adapter()
    try:
        data = await storage.download_file(asset.file_path)
        return Response(content=data, media_type=asset.mime_type)
    except (FileNotFoundError, PermissionError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on storage")


@router.get("/derivatives/{derivative_id}/file")
async def download_derivative_file(
    derivative_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Secure direct download of derivative crop by derivative ID enforcing database ownership."""
    deriv = db.query(ImageDerivative).filter(
        ImageDerivative.id == derivative_id,
        ImageDerivative.user_id == current_user.id,
    ).first()
    if not deriv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Derivative crop not found")

    storage = get_storage_adapter()
    try:
        data = await storage.download_file(deriv.storage_path)
        return Response(content=data, media_type=deriv.mime_type)
    except (FileNotFoundError, PermissionError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on storage")
