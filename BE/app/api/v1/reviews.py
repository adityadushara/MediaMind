from datetime import datetime, timezone
import logging
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import (
    IdentificationCandidate,
    ImageDerivative,
    SourceAsset,
    LibraryItem,
    ItemSource,
    ProcessingJob,
)
from app.schemas.common import (
    CandidateListResponse,
    IdentificationCandidateDetailResponse,
    CandidateUpdateRequest,
    ReviewAcceptRequest,
    ReviewCountsResponse,
    LibraryItemResponse,
)
from app.adapters.storage import get_storage_adapter
from app.services.link_generator import generate_direct_link, resolve_subcategory

logger = logging.getLogger("mediamind.reviews")
router = APIRouter(prefix="/reviews", tags=["Candidate Review Queue"])


@router.get("/counts", response_model=ReviewCountsResponse)
def get_review_counts(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns summary counts of candidates by review state for the current authenticated user.
    """
    base_query = db.query(IdentificationCandidate).filter(IdentificationCandidate.user_id == current_user.id)

    pending_review = base_query.filter(IdentificationCandidate.review_status == "needs_review").count()
    accepted = base_query.filter(IdentificationCandidate.review_status == "accepted").count()
    rejected = base_query.filter(IdentificationCandidate.review_status == "rejected").count()
    total = base_query.count()

    return ReviewCountsResponse(
        pending_review=pending_review,
        accepted=accepted,
        rejected=rejected,
        total=total,
    )


@router.get("/candidates", response_model=CandidateListResponse)
async def list_candidates(
    review_status: Optional[str] = Query("needs_review", description="Filter by review status: needs_review, accepted, rejected, all"),
    content_type: Optional[str] = Query(None, description="Filter by suggested content type"),
    job_id: Optional[str] = Query(None, description="Filter candidates belonging to a specific job"),
    source_asset_id: Optional[str] = Query(None, description="Filter candidates from a specific source asset"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lists multimodal extraction candidates for review with signed crop and source URLs.
    Enforces user isolation.
    """
    query = db.query(IdentificationCandidate).filter(IdentificationCandidate.user_id == current_user.id)

    if review_status and review_status != "all":
        query = query.filter(IdentificationCandidate.review_status == review_status)
    if content_type:
        query = query.filter(IdentificationCandidate.suggested_type == content_type)
    if job_id:
        query = query.filter(IdentificationCandidate.job_id == job_id)
    if source_asset_id:
        query = query.filter(IdentificationCandidate.source_asset_id == source_asset_id)

    total = query.count()
    candidates = query.order_by(IdentificationCandidate.created_at.desc()).offset(offset).limit(limit).all()

    storage = get_storage_adapter()
    items: List[IdentificationCandidateDetailResponse] = []

    for cand in candidates:
        source_url = None
        crop_url = None

        if cand.source_asset:
            source_url = await storage.get_signed_url(cand.source_asset.file_path)

        if cand.derivative:
            crop_url = await storage.get_signed_url(cand.derivative.storage_path)

        detail = IdentificationCandidateDetailResponse.model_validate(cand)
        detail.source_signed_url = source_url
        detail.crop_signed_url = crop_url
        items.append(detail)

    return CandidateListResponse(total=total, items=items)


@router.get("/candidates/{candidate_id}", response_model=IdentificationCandidateDetailResponse)
async def get_candidate(
    candidate_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves full candidate inspection details with signed URLs.
    """
    cand = db.query(IdentificationCandidate).filter(
        IdentificationCandidate.id == candidate_id,
        IdentificationCandidate.user_id == current_user.id,
    ).first()

    if not cand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    storage = get_storage_adapter()
    source_url = None
    crop_url = None

    if cand.source_asset:
        source_url = await storage.get_signed_url(cand.source_asset.file_path)
    if cand.derivative:
        crop_url = await storage.get_signed_url(cand.derivative.storage_path)

    detail = IdentificationCandidateDetailResponse.model_validate(cand)
    detail.source_signed_url = source_url
    detail.crop_signed_url = crop_url
    return detail


@router.patch("/candidates/{candidate_id}", response_model=IdentificationCandidateDetailResponse)
async def update_candidate(
    candidate_id: str,
    payload: CandidateUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allows user manual editing of candidate attributes (title, creator, type, clues) before approval.
    """
    cand = db.query(IdentificationCandidate).filter(
        IdentificationCandidate.id == candidate_id,
        IdentificationCandidate.user_id == current_user.id,
    ).first()

    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if payload.suggested_title is not None:
        cand.suggested_title = payload.suggested_title.strip()
    if payload.suggested_creator is not None:
        cand.suggested_creator = payload.suggested_creator.strip() if payload.suggested_creator else None
    if payload.suggested_type is not None:
        cand.suggested_type = payload.suggested_type
    if payload.suggested_subcategory is not None:
        cand.suggested_subcategory = payload.suggested_subcategory.strip() if payload.suggested_subcategory else None
    if payload.direct_url is not None:
        cand.direct_url = payload.direct_url.strip() if payload.direct_url else None
    if payload.description_clue is not None:
        cand.description_clue = payload.description_clue
    if payload.year_clue is not None:
        cand.year_clue = payload.year_clue

    db.commit()
    db.refresh(cand)

    storage = get_storage_adapter()
    source_url = None
    crop_url = None
    if cand.source_asset:
        source_url = await storage.get_signed_url(cand.source_asset.file_path)
    if cand.derivative:
        crop_url = await storage.get_signed_url(cand.derivative.storage_path)

    detail = IdentificationCandidateDetailResponse.model_validate(cand)
    detail.source_signed_url = source_url
    detail.crop_signed_url = crop_url
    return detail


@router.post("/candidates/{candidate_id}/accept", response_model=LibraryItemResponse)
def accept_candidate(
    candidate_id: str,
    payload: ReviewAcceptRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Approves candidate, creates verified LibraryItem, and creates traceable ItemSource link to original screenshot.
    """
    cand = db.query(IdentificationCandidate).filter(
        IdentificationCandidate.id == candidate_id,
        IdentificationCandidate.user_id == current_user.id,
    ).first()

    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    title = payload.title or cand.suggested_title
    creator = payload.creator if payload.creator is not None else cand.suggested_creator
    content_type = payload.content_type or cand.suggested_type or "other"
    subcategory = payload.subcategory or cand.suggested_subcategory or resolve_subcategory(content_type)
    direct_url = payload.direct_url or cand.direct_url or generate_direct_link(title, creator, content_type)
    consumption_status = payload.consumption_status or "want_to_consume"
    release_year = payload.release_year if payload.release_year is not None else cand.year_clue
    overview = payload.overview if payload.overview is not None else cand.description_clue

    # Extract top match from candidate provider_candidates if available
    top_provider_match = None
    if cand.provider_candidates and isinstance(cand.provider_candidates, list) and len(cand.provider_candidates) > 0:
        first = cand.provider_candidates[0]
        if isinstance(first, dict):
            top_provider_match = first.get("record", first)

    ext_provider = payload.external_provider or (top_provider_match.get("provider_name") if top_provider_match else None)
    ext_id = payload.external_id or (top_provider_match.get("external_id") if top_provider_match else None)
    isbn = payload.isbn or (top_provider_match.get("isbn") if top_provider_match else None)
    genre = payload.genre or (top_provider_match.get("genre") if top_provider_match else None)
    publisher = payload.publisher or (top_provider_match.get("publisher") if top_provider_match else None)
    cover_image_url = payload.cover_image_url or (top_provider_match.get("cover_image_url") if top_provider_match else None)
    provider_meta = payload.provider_metadata or (top_provider_match.get("raw_payload", {}) if top_provider_match else {})

    # Check for existing item (Deduplication Tiers 1 and 2)
    existing_item = None
    if ext_provider and ext_id:
        existing_item = db.query(LibraryItem).filter(
            LibraryItem.user_id == current_user.id,
            LibraryItem.external_provider == ext_provider,
            LibraryItem.external_id == ext_id,
        ).first()

    if not existing_item and isbn:
        existing_item = db.query(LibraryItem).filter(
            LibraryItem.user_id == current_user.id,
            LibraryItem.isbn == isbn,
        ).first()

    if existing_item:
        library_item = existing_item
        # Associate new source asset to existing item without creating duplicate
        existing_source = db.query(ItemSource).filter(
            ItemSource.library_item_id == existing_item.id,
            ItemSource.source_asset_id == cand.source_asset_id,
        ).first()
        if not existing_source:
            item_source = ItemSource(
                id=str(uuid.uuid4()),
                library_item_id=existing_item.id,
                source_asset_id=cand.source_asset_id,
                crop_coordinates=cand.bounding_box,
                detection_confidence=cand.confidence_score,
            )
            db.add(item_source)
    else:
        # 1. Create verified library item
        library_item = LibraryItem(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            title=title,
            creator=creator,
            content_type=content_type,
            subcategory=subcategory,
            direct_url=direct_url,
            consumption_status=consumption_status,
            release_year=release_year,
            overview=overview,
            cover_image_url=cover_image_url,
            original_title=top_provider_match.get("original_title") if top_provider_match else None,
            isbn=isbn,
            genre=genre,
            publisher=publisher,
            external_provider=ext_provider,
            external_id=ext_id,
            provider_metadata=provider_meta,
            verification_status="verified",
            user_rating=payload.user_rating,
        )
        db.add(library_item)
        db.flush()

        # 2. Create traceable ItemSource linking screenshot to item
        item_source = ItemSource(
            id=str(uuid.uuid4()),
            library_item_id=library_item.id,
            source_asset_id=cand.source_asset_id,
            crop_coordinates=cand.bounding_box,
            detection_confidence=cand.confidence_score,
        )
        db.add(item_source)

    # 3. Update candidate review and resolution status
    now = datetime.now(timezone.utc)
    cand.review_status = "accepted"
    cand.resolution_status = "resolved"
    cand.resolved_library_item_id = library_item.id
    cand.resolved_at = now

    # 4. Check if all candidates for the parent job have completed review
    if cand.job_id:
        pending_remaining = db.query(IdentificationCandidate).filter(
            IdentificationCandidate.job_id == cand.job_id,
            IdentificationCandidate.review_status.in_(["needs_review", "pending"]),
            IdentificationCandidate.id != cand.id,
        ).count()

        if pending_remaining == 0:
            parent_job = db.query(ProcessingJob).filter(ProcessingJob.id == cand.job_id).first()
            if parent_job and parent_job.status == "needs_review":
                parent_job.status = "identified"

    db.commit()
    db.refresh(library_item)
    return LibraryItemResponse.model_validate(library_item)


@router.post("/candidates/{candidate_id}/reject")
def reject_candidate(
    candidate_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Rejects candidate from the review queue. Preserves source asset evidence intact.
    """
    cand = db.query(IdentificationCandidate).filter(
        IdentificationCandidate.id == candidate_id,
        IdentificationCandidate.user_id == current_user.id,
    ).first()

    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    now = datetime.now(timezone.utc)
    cand.review_status = "rejected"
    cand.resolution_status = "resolved"
    cand.resolved_at = now

    # Update parent job status if all candidates resolved
    if cand.job_id:
        pending_remaining = db.query(IdentificationCandidate).filter(
            IdentificationCandidate.job_id == cand.job_id,
            IdentificationCandidate.review_status.in_(["needs_review", "pending"]),
            IdentificationCandidate.id != cand.id,
        ).count()

        if pending_remaining == 0:
            parent_job = db.query(ProcessingJob).filter(ProcessingJob.id == cand.job_id).first()
            if parent_job and parent_job.status == "needs_review":
                # Check if at least one candidate was accepted
                accepted_count = db.query(IdentificationCandidate).filter(
                    IdentificationCandidate.job_id == cand.job_id,
                    IdentificationCandidate.review_status == "accepted",
                ).count()
                parent_job.status = "identified" if accepted_count > 0 else "unidentified"

    db.commit()
    return {
        "success": True,
        "candidate_id": candidate_id,
        "review_status": "rejected",
    }


@router.post("/jobs/{job_id}/accept-all", response_model=List[LibraryItemResponse])
def accept_all_job_candidates(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accepts all pending candidates for a specific processing job, moving them into the library with links and subcategories.
    """
    candidates = db.query(IdentificationCandidate).filter(
        IdentificationCandidate.job_id == job_id,
        IdentificationCandidate.user_id == current_user.id,
        IdentificationCandidate.review_status.in_(["needs_review", "pending"]),
    ).all()

    accepted_items: List[LibraryItem] = []
    now = datetime.now(timezone.utc)

    for cand in candidates:
        subcat = cand.suggested_subcategory or resolve_subcategory(cand.suggested_type or "other")
        d_url = cand.direct_url or generate_direct_link(cand.suggested_title, cand.suggested_creator, cand.suggested_type or "other")

        library_item = LibraryItem(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            title=cand.suggested_title,
            creator=cand.suggested_creator,
            content_type=cand.suggested_type or "other",
            subcategory=subcat,
            direct_url=d_url,
            consumption_status="want_to_consume",
            release_year=cand.year_clue,
            overview=cand.description_clue,
            verification_status="verified",
        )
        db.add(library_item)
        db.flush()

        item_source = ItemSource(
            id=str(uuid.uuid4()),
            library_item_id=library_item.id,
            source_asset_id=cand.source_asset_id,
            crop_coordinates=cand.bounding_box,
            detection_confidence=cand.confidence_score,
        )
        db.add(item_source)

        cand.review_status = "accepted"
        cand.resolution_status = "resolved"
        cand.resolved_library_item_id = library_item.id
        cand.resolved_at = now
        accepted_items.append(library_item)

    parent_job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if parent_job and parent_job.status == "needs_review":
        parent_job.status = "identified"

    db.commit()
    for it in accepted_items:
        db.refresh(it)
    return accepted_items
