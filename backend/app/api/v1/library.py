from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc

from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import LibraryItem, ItemSource, SourceAsset
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

router = APIRouter(prefix="/library", tags=["Library Items"])


@router.get("", response_model=LibraryItemListResponse)
def list_library_items(
    content_type: Optional[ContentType] = None,
    consumption_status: Optional[ConsumptionStatus] = None,
    search: Optional[str] = None,
    sort_by: str = Query("created_at", pattern="^(created_at|title|user_rating)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(LibraryItem).filter(LibraryItem.user_id == current_user.id)

    if content_type:
        query = query.filter(LibraryItem.content_type == content_type)
    if consumption_status:
        query = query.filter(LibraryItem.consumption_status == consumption_status)
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

    return LibraryItemListResponse(total=total, items=items)


@router.post("", response_model=LibraryItemResponse, status_code=status.HTTP_201_CREATED)
def create_library_item(
    payload: LibraryItemCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = LibraryItem(
        user_id=current_user.id,
        title=payload.title,
        creator=payload.creator,
        content_type=payload.content_type,
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

    return LibraryItemDetailResponse(
        id=item.id,
        user_id=item.user_id,
        title=item.title,
        creator=item.creator,
        content_type=item.content_type,
        consumption_status=item.consumption_status,
        release_year=item.release_year,
        overview=item.overview,
        cover_image_url=item.cover_image_url,
        external_provider=item.external_provider,
        external_id=item.external_id,
        provider_metadata=item.provider_metadata,
        user_rating=float(item.user_rating) if item.user_rating is not None else None,
        verification_status=item.verification_status,
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
    return item


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
