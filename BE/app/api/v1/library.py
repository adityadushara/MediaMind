from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc

from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import LibraryItem, ItemSource, SourceAsset, IdentificationCandidate, ProcessingJob
from app.schemas.common import (
    LibraryItemCreate,
    LibraryItemUpdate,
    LibraryItemResponse,
    LibraryItemDetailResponse,
    LinkedSourceAsset,
    LibraryItemListResponse,
    ContentType,
    ConsumptionStatus,
)
from app.adapters.storage import get_storage_adapter
from app.services.link_generator import generate_direct_link, resolve_subcategory

router = APIRouter(prefix="/library", tags=["Library Items"])


def populate_item_media_urls(item: LibraryItem) -> Optional[str]:
    screenshot_url = None
    if item.sources:
        src = item.sources[0]
        if src.source_asset:
            screenshot_url = f"/api/v1/assets/media/{src.source_asset.file_path.lstrip('/')}"
            if not item.cover_image_url:
                if src.source_asset.derivatives:
                    item.cover_image_url = f"/api/v1/assets/media/{src.source_asset.derivatives[0].storage_path.lstrip('/')}"
                else:
                    item.cover_image_url = screenshot_url
    setattr(item, "screenshot_url", screenshot_url)
    return screenshot_url


@router.get("", response_model=LibraryItemListResponse)
def list_library_items(
    content_type: Optional[ContentType] = None,
    subcategory: Optional[str] = None,
    consumption_status: Optional[ConsumptionStatus] = None,
    verification_status: Optional[str] = Query(None, description="Filter by verification status, e.g. 'needs_review', 'verified'"),
    search: Optional[str] = None,
    sort_by: str = Query("created_at", pattern="^(created_at|updated_at|title|user_rating)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(LibraryItem).filter(LibraryItem.user_id == current_user.id)

    if content_type:
        query = query.filter(LibraryItem.content_type == content_type)
    if subcategory:
        query = query.filter(LibraryItem.subcategory == subcategory)
    if consumption_status:
        query = query.filter(LibraryItem.consumption_status == consumption_status)
    if verification_status:
        query = query.filter(LibraryItem.verification_status == verification_status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                LibraryItem.title.ilike(pattern),
                LibraryItem.creator.ilike(pattern)
            )
        )

    total = query.count()

    sort_col = getattr(LibraryItem, sort_by)
    query = query.order_by(desc(sort_col) if order == "desc" else asc(sort_col))
    items = query.offset(offset).limit(limit).all()

    for item in items:
        populate_item_media_urls(item)

    return LibraryItemListResponse(total=total, items=items)


@router.get("/subcategories", response_model=List[str])
def list_subcategories(
    content_type: Optional[ContentType] = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns distinct subcategories configured or existing in the user's library.
    """
    query = db.query(LibraryItem.subcategory).filter(
        LibraryItem.user_id == current_user.id,
        LibraryItem.subcategory.isnot(None)
    )
    if content_type:
        query = query.filter(LibraryItem.content_type == content_type)

    results = [r[0] for r in query.distinct().all() if r[0]]

    presets = {
        "book": ["Psychology", "Habits", "Money & Finance", "Business", "Fiction", "Self-Help", "Philosophy", "Science"],
        "youtube_video": ["Tech & Programming", "Tutorials", "Podcasts", "Science", "Education", "Entertainment"],
        "movie": ["Sci-Fi", "Drama", "Thriller", "Comedy", "Action", "Documentary"],
        "course": ["Programming", "Design", "Business", "AI & Data"],
    }
    if content_type and content_type in presets:
        combined = list(dict.fromkeys(results + presets[content_type]))
        return combined
    return results


@router.post("", response_model=LibraryItemResponse, status_code=status.HTTP_201_CREATED)
def create_library_item(
    payload: LibraryItemCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    subcat = payload.subcategory or resolve_subcategory(payload.content_type)
    d_url = payload.direct_url or generate_direct_link(payload.title, payload.creator, payload.content_type)
    item = LibraryItem(
        user_id=current_user.id,
        title=payload.title,
        creator=payload.creator,
        content_type=payload.content_type,
        subcategory=subcat,
        direct_url=d_url,
        consumption_status=payload.consumption_status,
        release_year=payload.release_year,
        overview=payload.overview,
        cover_image_url=payload.cover_image_url,
        external_provider=payload.external_provider,
        external_id=payload.external_id,
        provider_metadata=payload.provider_metadata,
        user_rating=payload.user_rating,
        verification_status="manual_entry"
    )
    db.add(item)
    db.flush()

    if payload.source_asset_id:
        asset = db.query(SourceAsset).filter(
            SourceAsset.id == payload.source_asset_id,
            SourceAsset.user_id == current_user.id
        ).first()
        if asset:
            item_source = ItemSource(
                library_item_id=item.id,
                source_asset_id=asset.id
            )
            db.add(item_source)

    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=LibraryItemDetailResponse)
async def get_library_item(
    item_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(LibraryItem).filter(
        LibraryItem.id == item_id,
        LibraryItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")

    storage = get_storage_adapter()
    linked_sources: list[LinkedSourceAsset] = []

    for item_source in item.sources:
        asset = item_source.source_asset
        if asset:
            signed_url = await storage.get_signed_url(asset.file_path, expires_in_seconds=900)
            linked_sources.append(
                LinkedSourceAsset(
                    id=asset.id,
                    file_name=asset.file_name,
                    file_path=asset.file_path,
                    file_size_bytes=asset.file_size_bytes,
                    mime_type=asset.mime_type,
                    sha256_hash=asset.sha256_hash,
                    image_width=asset.image_width,
                    image_height=asset.image_height,
                    signed_url=signed_url,
                    crop_coordinates=item_source.crop_coordinates,
                    created_at=asset.created_at,
                )
            )

    screenshot_url = populate_item_media_urls(item)

    return LibraryItemDetailResponse(
        id=item.id,
        user_id=item.user_id,
        title=item.title,
        creator=item.creator,
        content_type=item.content_type,
        subcategory=item.subcategory,
        direct_url=item.direct_url,
        consumption_status=item.consumption_status,
        release_year=item.release_year,
        overview=item.overview,
        cover_image_url=item.cover_image_url,
        external_provider=item.external_provider,
        external_id=item.external_id,
        provider_metadata=item.provider_metadata,
        user_rating=float(item.user_rating) if item.user_rating is not None else None,
        verification_status=item.verification_status,
        screenshot_url=screenshot_url,
        created_at=item.created_at,
        updated_at=item.updated_at,
        sources=linked_sources,
    )


@router.patch("/{item_id}", response_model=LibraryItemResponse)
def update_library_item(
    item_id: str,
    payload: LibraryItemUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(LibraryItem).filter(
        LibraryItem.id == item_id,
        LibraryItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    populate_item_media_urls(item)
    return item


@router.post("/{item_id}/verify", response_model=LibraryItemResponse)
def verify_library_item(
    item_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marks a library item as verified/kept by the user and resolves linked candidates."""
    item = db.query(LibraryItem).filter(
        LibraryItem.id == item_id,
        LibraryItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")

    item.verification_status = "verified"

    # Also resolve any linked candidates
    now = datetime.now(timezone.utc)
    candidates = db.query(IdentificationCandidate).filter(
        IdentificationCandidate.resolved_library_item_id == item_id,
        IdentificationCandidate.user_id == current_user.id,
    ).all()
    for cand in candidates:
        cand.review_status = "accepted"
        cand.resolution_status = "resolved"
        cand.resolved_at = now
        if cand.job_id:
            parent_job = db.query(ProcessingJob).filter(ProcessingJob.id == cand.job_id).first()
            if parent_job and parent_job.status == "needs_review":
                parent_job.status = "identified"

    db.commit()
    db.refresh(item)
    populate_item_media_urls(item)
    return item


@router.post("/verify-all", status_code=status.HTTP_200_OK)
def verify_all_library_items(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marks all 'needs_review' library items as verified for the current user."""
    items = db.query(LibraryItem).filter(
        LibraryItem.user_id == current_user.id,
        LibraryItem.verification_status == "needs_review"
    ).all()

    now = datetime.now(timezone.utc)
    count = 0
    for item in items:
        item.verification_status = "verified"
        count += 1
        candidates = db.query(IdentificationCandidate).filter(
            IdentificationCandidate.resolved_library_item_id == item.id,
            IdentificationCandidate.user_id == current_user.id,
        ).all()
        for cand in candidates:
            cand.review_status = "accepted"
            cand.resolution_status = "resolved"
            cand.resolved_at = now
            if cand.job_id:
                parent_job = db.query(ProcessingJob).filter(ProcessingJob.id == cand.job_id).first()
                if parent_job and parent_job.status == "needs_review":
                    parent_job.status = "identified"

    db.commit()
    return {"verified_count": count}


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_library_item(
    item_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(LibraryItem).filter(
        LibraryItem.id == item_id,
        LibraryItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")

    db.delete(item)
    db.commit()
    return None


@router.post("/{item_id}/sources/{asset_id}", status_code=status.HTTP_201_CREATED)
def link_source_to_library_item(
    item_id: str,
    asset_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Associates a source asset to a library item.
    Enforces strict ownership on both the library item AND the source asset.
    """
    item = db.query(LibraryItem).filter(
        LibraryItem.id == item_id,
        LibraryItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")

    asset = db.query(SourceAsset).filter(
        SourceAsset.id == asset_id,
        SourceAsset.user_id == current_user.id
    ).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source asset not found or not owned by user"
        )

    existing = db.query(ItemSource).filter(
        ItemSource.library_item_id == item_id,
        ItemSource.source_asset_id == asset_id
    ).first()
    if existing:
        return {
            "status": "already_linked",
            "library_item_id": item_id,
            "source_asset_id": asset_id
        }

    link = ItemSource(library_item_id=item_id, source_asset_id=asset_id)
    db.add(link)
    db.commit()

    return {
        "status": "linked",
        "library_item_id": item_id,
        "source_asset_id": asset_id
    }


@router.delete("/{item_id}/sources/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_source_from_library_item(
    item_id: str,
    asset_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Removes the association between a source asset and a library item.
    Does NOT delete the library item or the source screenshot.
    """
    item = db.query(LibraryItem).filter(
        LibraryItem.id == item_id,
        LibraryItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library item not found")

    link = db.query(ItemSource).filter(
        ItemSource.library_item_id == item_id,
        ItemSource.source_asset_id == asset_id
    ).first()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source association not found")

    db.delete(link)
    db.commit()
    return None
