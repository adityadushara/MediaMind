import argparse
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import signal
import sys
import time
from typing import Optional
import uuid

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.core.config import settings
from app.db.session import SessionLocal, engine, Base
from app.models.entities import (
    ProcessingJob,
    SourceAsset,
    ProcessingRun,
    ImageDerivative,
    IdentificationCandidate,
    LibraryItem,
    ItemSource,
)
from app.adapters.storage import get_storage_adapter, BaseStorageAdapter
from app.adapters.ai import get_ai_adapter, GeminiAdapter
from app.services.cv_service import CVService
from app.services.link_generator import generate_direct_link, resolve_subcategory
from app.adapters.metadata.router import MetadataProviderRouter
from app.services.entity_resolution import EntityResolutionEngine
from app.schemas.metadata import MetadataSearchQuery

logger = logging.getLogger("mediamind.worker")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)

# Global flag for graceful shutdown handling
_shutdown_requested = False


def _handle_shutdown_signal(signum, frame):
    global _shutdown_requested
    logger.info(f"Received termination signal ({signum}). Requesting graceful worker stop...")
    _shutdown_requested = True


def claim_next_job(
    db: Session,
    worker_id: str,
    lease_seconds: int = 300,
) -> Optional[ProcessingJob]:
    """
    Atomically claims the next eligible queued or stale job from the queue.
    Assigns a unique lease_token UUID to prevent split-brain worker executions.
    """
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(seconds=lease_seconds)

    # 1. Candidate selection: oldest queued/awaiting job or expired processing lease
    candidate = (
        db.query(ProcessingJob)
        .filter(
            or_(
                ProcessingJob.status.in_(["queued", "awaiting_identification"]),
                and_(
                    ProcessingJob.status == "processing",
                    ProcessingJob.claimed_at < stale_cutoff,
                    ProcessingJob.retry_count < ProcessingJob.max_retries,
                ),
            )
        )
        .order_by(ProcessingJob.created_at.asc())
        .first()
    )

    if not candidate:
        return None

    new_lease_token = str(uuid.uuid4())

    # 2. Atomic state transition check
    updated_rows = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.id == candidate.id,
            or_(
                ProcessingJob.status.in_(["queued", "awaiting_identification"]),
                and_(
                    ProcessingJob.status == "processing",
                    ProcessingJob.claimed_at < stale_cutoff,
                ),
            ),
        )
        .update(
            {
                "status": "processing",
                "claimed_at": now,
                "claimed_by": worker_id,
                "lease_token": new_lease_token,
            },
            synchronize_session=False,
        )
    )

    db.commit()

    if updated_rows > 0:
        db.refresh(candidate)
        logger.info(
            f"Worker '{worker_id}' atomically claimed job {candidate.id} "
            f"(user={candidate.user_id}, lease_token={new_lease_token})"
        )
        return candidate

    return None


def heartbeat_job(
    db: Session,
    job_id: str,
    worker_id: Optional[str] = None,
    lease_token: Optional[str] = None,
    lease_seconds: int = 300,
) -> bool:
    """
    Refreshes the active lease timestamp for a running job.
    Enforces that only the current lease holder (matching lease_token and/or worker_id)
    can extend the lease.
    Returns True if lease was extended, False if the lease was lost or already re-assigned.
    """
    now = datetime.now(timezone.utc)
    filters = [
        ProcessingJob.id == job_id,
        ProcessingJob.status == "processing",
    ]
    if lease_token:
        filters.append(ProcessingJob.lease_token == lease_token)
    if worker_id:
        filters.append(ProcessingJob.claimed_by == worker_id)

    updated = (
        db.query(ProcessingJob)
        .filter(*filters)
        .update({"claimed_at": now}, synchronize_session=False)
    )
    db.commit()
    return updated > 0


def recover_stale_jobs(db: Session, lease_seconds: int = 300) -> int:
    """
    Scans for expired jobs stranded in 'processing' and resets them to 'queued' or marks 'failed'.
    """
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(seconds=lease_seconds)

    stale_jobs = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.status == "processing",
            or_(
                ProcessingJob.claimed_at < stale_cutoff,
                and_(ProcessingJob.claimed_at == None, ProcessingJob.updated_at < stale_cutoff),
            ),
        )
        .all()
    )

    recovered = 0
    for job in stale_jobs:
        if job.retry_count < job.max_retries:
            job.status = "queued"
            job.claimed_at = None
            job.claimed_by = None
            job.lease_token = None
            job.retry_count += 1
            recovered += 1
        else:
            job.status = "failed"
            job.error_message = f"Job timed out after {lease_seconds}s lease and reached maximum retries"
            job.lease_token = None

    if stale_jobs:
        db.commit()
        logger.info(f"Recovered {recovered} stale jobs; marked {len(stale_jobs) - recovered} as failed.")

    return recovered


async def _process_job_async(
    job_id: str,
    db: Session,
    storage_adapter: Optional[BaseStorageAdapter] = None,
    ai_adapter: Optional[GeminiAdapter] = None,
    cv_service: Optional[CVService] = None,
    worker_id: Optional[str] = None,
    lease_token: Optional[str] = None,
) -> bool:
    """
    Asynchronous implementation of multimodal extraction & computer vision pipeline.
    """
    storage = storage_adapter or get_storage_adapter()
    ai = ai_adapter or get_ai_adapter()
    cv = cv_service or CVService()

    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        logger.error(f"Job {job_id} not found in database.")
        return False

    if job.status != "processing":
        logger.warning(f"Job {job_id} is in status '{job.status}', expected 'processing'. Skipping.")
        return False

    if lease_token and job.lease_token != lease_token:
        logger.warning(
            f"Job {job_id} lease token mismatch (expected '{lease_token}', got '{job.lease_token}'). Skipping."
        )
        return False

    logger.info(f"Starting processing pipeline for job {job.id} (user={job.user_id})")

    # 1. Fetch SourceAsset ensuring tenancy match
    asset = (
        db.query(SourceAsset)
        .filter(
            SourceAsset.id == job.source_asset_id,
            SourceAsset.user_id == job.user_id,
        )
        .first()
    )

    if not asset:
        error_msg = f"SourceAsset {job.source_asset_id} not found or user mismatch."
        logger.error(error_msg)
        job.status = "failed"
        job.error_message = error_msg
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        return False

    try:
        # 2. Retrieve original screenshot bytes (strictly non-destructive)
        raw_bytes = await storage.download_file(asset.file_path)

        # 3. Orient image and normalize color space
        rgb_img, orientation_meta = cv.load_and_orient_image(raw_bytes)

        # 4. Resize conservatively for Gemini extraction
        processed_img, scale_factor = cv.resize_for_processing(rgb_img)
        encoded_bytes, mime_type = cv.encode_image_for_gemini(processed_img)

        # 5. Extract multimodal candidates using versioned Gemini Adapter
        extraction_res = ai.extract_candidates(encoded_bytes)

        # 6. Record ProcessingRun telemetry record
        run_id = str(uuid.uuid4())
        is_success = extraction_res.error_category is None

        run = ProcessingRun(
            id=run_id,
            job_id=job.id,
            user_id=job.user_id,
            source_asset_id=asset.id,
            prompt_identifier=extraction_res.prompt_identifier,
            prompt_version=extraction_res.prompt_version,
            ai_model_name=extraction_res.ai_model_name,
            status="completed" if is_success else "failed",
            processing_duration_ms=extraction_res.duration_ms,
            prompt_tokens=extraction_res.prompt_tokens,
            candidate_tokens=extraction_res.candidate_tokens,
            total_tokens=extraction_res.total_tokens,
            estimated_cost_usd=extraction_res.estimated_cost_usd,
            region_count=0,
            candidate_count=len(extraction_res.candidates),
            error_category=extraction_res.error_category,
            error_message=extraction_res.error_message,
            raw_response={"raw": extraction_res.raw_response_text} if extraction_res.raw_response_text else None,
        )
        db.add(run)
        db.flush()

        # 7. Check if Gemini extraction had an unrecoverable failure
        if not is_success:
            logger.warning(
                f"Extraction failed for job {job.id}: [{extraction_res.error_category}] {extraction_res.error_message}"
            )
            job.retry_count += 1
            job.error_message = extraction_res.error_message
            job.error_details = {"error_category": extraction_res.error_category}

            is_daily_quota = (
                extraction_res.error_category == "rate_limit" and (
                    "daily limit" in (extraction_res.error_message or "").lower() or
                    "per day" in (extraction_res.error_message or "").lower() or
                    "free_tier_requests" in (extraction_res.error_message or "").lower()
                )
            )

            if is_daily_quota or job.retry_count >= job.max_retries:
                job.status = "failed"
                job.completed_at = datetime.now(timezone.utc)
            else:
                job.status = "queued"
                job.claimed_at = None
                job.claimed_by = None

            db.commit()
            return False

        # 8. Verify lease is still held by this lease_token before committing candidate/derivative side effects
        if lease_token:
            lease_valid = (
                db.query(ProcessingJob)
                .filter(
                    ProcessingJob.id == job.id,
                    ProcessingJob.status == "processing",
                    ProcessingJob.lease_token == lease_token,
                )
                .first()
            )
            if not lease_valid:
                logger.error(
                    f"Lease token '{lease_token}' for job {job.id} is no longer active. Aborting candidate persistence."
                )
                db.rollback()
                return False

        # 9. Clean up any previous pending candidates for this job (idempotent re-run)
        db.query(IdentificationCandidate).filter(
            IdentificationCandidate.job_id == job.id,
            IdentificationCandidate.review_status.in_(["pending", "needs_review"]),
        ).delete(synchronize_session=False)

        # Look up existing initial LibraryItem created during screenshot upload
        existing_item_source = (
            db.query(ItemSource)
            .join(LibraryItem, ItemSource.library_item_id == LibraryItem.id)
            .filter(
                ItemSource.source_asset_id == asset.id,
                LibraryItem.user_id == job.user_id,
            )
            .first()
        )
        initial_library_item = existing_item_source.library_item if existing_item_source else None

        # 10. Process candidates and generate high-fidelity derivative crops
        candidate_count = 0
        completion_time = datetime.now(timezone.utc)

        for idx, cand_out in enumerate(extraction_res.candidates):
            derivative_id = None
            crop_storage_path = None

            # Generate crop if candidate provided a valid bounding box
            if cand_out.bounding_box:
                box_dict = cand_out.bounding_box.model_dump()
                if cv.validate_bounding_box(box_dict):
                    try:
                        crop_bytes, crop_w, crop_h = cv.generate_crop(rgb_img, box_dict)
                        new_derivative_id = str(uuid.uuid4())
                        crop_storage_path = f"screenshots/{job.user_id}/derivatives/{new_derivative_id}.jpg"

                        # Persist derivative crop to storage
                        await storage.upload_file(crop_storage_path, crop_bytes, mime_type="image/jpeg")

                        # Insert ImageDerivative record
                        derivative = ImageDerivative(
                            id=new_derivative_id,
                            user_id=job.user_id,
                            source_asset_id=asset.id,
                            run_id=run.id,
                            derivative_type="region_crop",
                            storage_path=crop_storage_path,
                            file_name=f"{new_derivative_id}.jpg",
                            file_size_bytes=len(crop_bytes),
                            mime_type="image/jpeg",
                            image_width=crop_w,
                            image_height=crop_h,
                            bounding_box=box_dict,
                            processing_version=extraction_res.prompt_version,
                        )
                        db.add(derivative)
                        db.flush()
                        derivative_id = new_derivative_id
                    except Exception as crop_err:
                        logger.error(f"Failed to generate/save crop for candidate '{cand_out.title}': {crop_err}")

            # Generate subcategory & direct link
            subcat = resolve_subcategory(cand_out.content_type, getattr(cand_out, "subcategory", None))
            direct_link = generate_direct_link(
                title=cand_out.title,
                creator=cand_out.creator,
                content_type=cand_out.content_type,
                raw_url=getattr(cand_out, "direct_url", None),
            )

            # Query external metadata providers and score matches (M4)
            meta_router = MetadataProviderRouter()
            res_engine = EntityResolutionEngine()
            provider_candidates_data = []
            top_provider_match = None
            try:
                search_query = MetadataSearchQuery(
                    title=cand_out.title,
                    creator=cand_out.creator,
                    content_type=cand_out.content_type,
                    release_year=cand_out.year_clue,
                )
                provider_records = await asyncio.wait_for(meta_router.search(search_query), timeout=1.5)
                if provider_records:
                    ranked_matches = res_engine.rank_candidates(cand_out, provider_records)
                    provider_candidates_data = [m.model_dump() for m in ranked_matches]
                    if ranked_matches and ranked_matches[0].is_top_match:
                        top = ranked_matches[0].record
                        top_provider_match = top.model_dump()
                        if top.provider_url and not getattr(cand_out, "direct_url", None):
                            direct_link = top.provider_url
            except Exception as meta_err:
                logger.warning(f"Metadata enrichment error for '{cand_out.title}': {meta_err}")

            # Determine best cover image URL (prefer local crop derivative, then provider cover, then original screenshot)
            if crop_storage_path:
                best_cover = f"/api/v1/assets/media/{crop_storage_path.lstrip('/')}"
            elif top_provider_match and top_provider_match.get("cover_image_url"):
                best_cover = top_provider_match["cover_image_url"]
            else:
                best_cover = f"/api/v1/assets/media/{asset.file_path.lstrip('/')}"

            # Directly update or add to library
            assigned_item_id = None
            if idx == 0 and initial_library_item:
                initial_library_item.title = cand_out.title
                initial_library_item.creator = cand_out.creator
                initial_library_item.content_type = cand_out.content_type or "other"
                initial_library_item.subcategory = subcat
                initial_library_item.direct_url = direct_link
                initial_library_item.release_year = cand_out.year_clue
                initial_library_item.overview = cand_out.description_clue
                initial_library_item.cover_image_url = best_cover
                if top_provider_match:
                    initial_library_item.original_title = top_provider_match.get("original_title")
                    initial_library_item.isbn = top_provider_match.get("isbn")
                    initial_library_item.genre = top_provider_match.get("genre")
                    initial_library_item.publisher = top_provider_match.get("publisher")
                    initial_library_item.external_provider = top_provider_match.get("provider_name")
                    initial_library_item.external_id = top_provider_match.get("external_id")
                    initial_library_item.provider_metadata = top_provider_match.get("raw_payload", {})
                initial_library_item.verification_status = "verified"
                assigned_item_id = initial_library_item.id
            else:
                new_lib_item = LibraryItem(
                    id=str(uuid.uuid4()),
                    user_id=job.user_id,
                    title=cand_out.title,
                    creator=cand_out.creator,
                    content_type=cand_out.content_type or "other",
                    subcategory=subcat,
                    direct_url=direct_link,
                    consumption_status="want_to_consume",
                    release_year=cand_out.year_clue,
                    overview=cand_out.description_clue,
                    cover_image_url=best_cover,
                    original_title=top_provider_match.get("original_title") if top_provider_match else None,
                    isbn=top_provider_match.get("isbn") if top_provider_match else None,
                    genre=top_provider_match.get("genre") if top_provider_match else None,
                    publisher=top_provider_match.get("publisher") if top_provider_match else None,
                    external_provider=top_provider_match.get("provider_name") if top_provider_match else None,
                    external_id=top_provider_match.get("external_id") if top_provider_match else None,
                    provider_metadata=top_provider_match.get("raw_payload", {}) if top_provider_match else {},
                    verification_status="verified",
                )
                db.add(new_lib_item)
                db.flush()

                new_src = ItemSource(
                    id=str(uuid.uuid4()),
                    library_item_id=new_lib_item.id,
                    source_asset_id=asset.id,
                    crop_coordinates=cand_out.bounding_box.model_dump() if cand_out.bounding_box else None,
                    detection_confidence=cand_out.confidence,
                )
                db.add(new_src)
                assigned_item_id = new_lib_item.id

            # Insert IdentificationCandidate record linked to library item
            cand_record = IdentificationCandidate(
                id=str(uuid.uuid4()),
                job_id=job.id,
                source_asset_id=asset.id,
                user_id=job.user_id,
                run_id=run.id,
                derivative_id=derivative_id,
                suggested_title=cand_out.title,
                suggested_creator=cand_out.creator,
                additional_creators=cand_out.additional_creators,
                suggested_type=cand_out.content_type,
                suggested_subcategory=subcat,
                direct_url=direct_link,
                description_clue=cand_out.description_clue,
                year_clue=cand_out.year_clue,
                visible_text=cand_out.visible_text,
                identifying_clues=cand_out.identifying_clues,
                uncertainty_reasons=cand_out.uncertainty_reasons,
                confidence_score=cand_out.confidence,
                evidence_text="; ".join(cand_out.evidence) if cand_out.evidence else None,
                bounding_box=cand_out.bounding_box.model_dump() if cand_out.bounding_box else None,
                provider_candidates=provider_candidates_data,
                review_status="needs_review",
                resolution_status="pending",
                resolved_library_item_id=assigned_item_id,
                prompt_version=extraction_res.prompt_version,
                ai_model_name=extraction_res.ai_model_name,
            )
            db.add(cand_record)
            candidate_count += 1

        if candidate_count == 0 and initial_library_item:
            initial_library_item.overview = "Screenshot preserved in library. No title was automatically recognized — you can edit details or keep it as is."
            initial_library_item.cover_image_url = f"/api/v1/assets/media/{asset.file_path.lstrip('/')}"
            initial_library_item.verification_status = "verified"

        # 11. Update job completion status with lease ownership verification
        completion_time = datetime.now(timezone.utc)
        target_status = "needs_review" if candidate_count > 0 else "unidentified"

        # If a lease_token or worker_id was supplied, atomically verify worker still owns the lease
        if lease_token or worker_id:
            filters = [
                ProcessingJob.id == job.id,
                ProcessingJob.status == "processing",
            ]
            if lease_token:
                filters.append(ProcessingJob.lease_token == lease_token)
            if worker_id:
                filters.append(ProcessingJob.claimed_by == worker_id)

            updated_completed = (
                db.query(ProcessingJob)
                .filter(*filters)
                .update(
                    {
                        "status": target_status,
                        "error_message": None,
                        "processing_time_ms": extraction_res.duration_ms,
                        "token_usage": {
                            "prompt_tokens": extraction_res.prompt_tokens,
                            "candidate_tokens": extraction_res.candidate_tokens,
                            "total_tokens": extraction_res.total_tokens,
                        },
                    },
                    synchronize_session=False,
                )
            )
            if updated_completed == 0:
                logger.error(
                    f"Worker '{worker_id}' (token={lease_token}) lost active lease on job {job.id} during processing! Aborting commit."
                )
                db.rollback()
                return False
        else:
            job.status = target_status
            job.error_message = None
            job.processing_time_ms = extraction_res.duration_ms

        db.commit()
        logger.info(
            f"Successfully finished job {job.id}: status={target_status}, candidates={candidate_count}, tokens={extraction_res.total_tokens}"
        )
        return True

    except Exception as exc:
        db.rollback()
        logger.exception(f"Unexpected exception processing job {job_id}: {exc}")
        fresh_job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if fresh_job:
            fresh_job.retry_count += 1
            fresh_job.error_message = f"Processing error: {str(exc)}"
            if fresh_job.retry_count >= fresh_job.max_retries:
                fresh_job.status = "failed"
            else:
                fresh_job.status = "queued"
                fresh_job.claimed_at = None
                fresh_job.claimed_by = None
                fresh_job.lease_token = None
            db.commit()
        return False


def process_job(
    job_id: str,
    db: Session,
    storage_adapter: Optional[BaseStorageAdapter] = None,
    ai_adapter: Optional[GeminiAdapter] = None,
    cv_service: Optional[CVService] = None,
    worker_id: Optional[str] = None,
    lease_token: Optional[str] = None,
) -> bool:
    """
    Synchronous wrapper for job execution.
    """
    return asyncio.run(
        _process_job_async(
            job_id=job_id,
            db=db,
            storage_adapter=storage_adapter,
            ai_adapter=ai_adapter,
            cv_service=cv_service,
            worker_id=worker_id,
            lease_token=lease_token,
        )
    )


def run_worker(
    poll_interval: Optional[float] = None,
    lease_seconds: Optional[int] = None,
    worker_id: Optional[str] = None,
    run_once: bool = False,
    max_iterations: Optional[int] = None,
):
    """
    Main persistent worker loop.
    Polls queue, claims jobs atomically, runs pipeline, and handles shutdown signals gracefully.
    """
    interval = poll_interval or settings.WORKER_POLL_INTERVAL_SECONDS
    lease = lease_seconds or settings.WORKER_LEASE_SECONDS
    w_id = worker_id or settings.WORKER_ID

    logger.info(
        f"MediaMind background worker started [id={w_id}, poll_interval={interval}s, lease={lease}s, run_once={run_once}]"
    )

    if settings.DATABASE_URL.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)

    # Attach signal listeners for graceful termination
    signal.signal(signal.SIGINT, _handle_shutdown_signal)
    signal.signal(signal.SIGTERM, _handle_shutdown_signal)

    storage = get_storage_adapter()
    ai = get_ai_adapter()
    cv = CVService()

    iterations = 0
    last_stale_recovery = 0.0

    while not _shutdown_requested:
        iterations += 1
        current_time = time.time()

        with SessionLocal() as db:
            # Periodically recover stale jobs every 60 seconds
            if current_time - last_stale_recovery > 60:
                try:
                    recover_stale_jobs(db, lease_seconds=lease)
                    last_stale_recovery = current_time
                except Exception as e:
                    logger.error(f"Error during stale job recovery: {e}")

            # Try claiming next job
            claimed_job = None
            try:
                claimed_job = claim_next_job(db, worker_id=w_id, lease_seconds=lease)
            except Exception as e:
                logger.error(f"Error claiming job: {e}")

            if claimed_job:
                try:
                    process_job(
                        job_id=claimed_job.id,
                        db=db,
                        storage_adapter=storage,
                        ai_adapter=ai,
                        cv_service=cv,
                        worker_id=w_id,
                        lease_token=claimed_job.lease_token,
                    )
                except Exception as e:
                    logger.exception(f"Unhandled error during job processing: {e}")
            else:
                if run_once:
                    logger.info("No queued jobs found and run_once=True. Exiting worker.")
                    break
                time.sleep(interval)

        if max_iterations and iterations >= max_iterations:
            logger.info(f"Reached max iterations ({max_iterations}). Exiting worker.")
            break

        if run_once and not claimed_job:
            break

    logger.info("Worker stopped gracefully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediaMind Background Worker Runner")
    parser.add_argument("--run-once", action="store_true", help="Process at most one job or queue check and exit")
    parser.add_argument("--poll-interval", type=float, default=None, help="Polling interval in seconds")
    parser.add_argument("--lease-seconds", type=int, default=None, help="Job lease duration before considering stale")
    parser.add_argument("--worker-id", type=str, default=None, help="Unique worker name")
    args = parser.parse_args()

    run_worker(
        poll_interval=args.poll_interval,
        lease_seconds=args.lease_seconds,
        worker_id=args.worker_id,
        run_once=args.run_once,
    )
