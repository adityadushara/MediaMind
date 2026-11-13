import hashlib
import io
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import SourceAsset, ProcessingJob
from app.schemas.common import AssetUploadResponse, BatchUploadResponse, SourceAssetResponse
from app.adapters.storage import get_storage_adapter

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
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")

    storage = get_storage_adapter()
    results: List[AssetUploadResponse] = []

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
                image_height=height
            )
            db.add(asset)

            # Create processing job record
            job_id = str(uuid.uuid4())
            job = ProcessingJob(
                id=job_id,
                user_id=current_user.id,
                source_asset_id=asset_id,
                status="queued"
            )
            db.add(job)
            db.commit()
        except Exception as e:
            db.rollback()
            # Clean up the file from storage if DB persistence failed
            await storage.delete_file(stored_path)
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
            status="queued"
        ))

    return BatchUploadResponse(assets=results, total_count=len(results))


@router.get("/{asset_id}", response_model=SourceAssetResponse)
def get_asset(
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
    return asset


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


@router.get("/media/{file_path:path}")
async def serve_local_media(
    file_path: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """Local development only endpoint to serve stored media files with strict user isolation."""
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not available in production")

    # Enforce user ownership of the file path
    clean_path = file_path.lstrip("/\\").replace("\\", "/")
    expected_prefix = f"screenshots/{current_user.id}/"
    if not clean_path.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: cannot access assets belonging to another user"
        )

    storage = get_storage_adapter()
    try:
        data = await storage.download_file(clean_path)
        mime = "image/png" if clean_path.endswith(".png") else "image/jpeg"
        return Response(content=data, media_type=mime)
    except (FileNotFoundError, PermissionError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
