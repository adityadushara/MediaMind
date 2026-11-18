from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import ProcessingJob
from app.schemas.common import (
    ProcessingJobResponse,
    JobClaimResponse,
    StaleJobRecoveryResponse,
)

router = APIRouter(prefix="/jobs", tags=["Processing Jobs"])

ELIGIBLE_RETRY_STATUSES = {"failed", "unidentified", "awaiting_identification"}


@router.get("", response_model=List[ProcessingJobResponse])
def list_jobs(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ProcessingJob).filter(ProcessingJob.user_id == current_user.id)
    if status_filter:
        query = query.filter(ProcessingJob.status == status_filter)
    jobs = query.order_by(ProcessingJob.created_at.desc()).offset(offset).limit(limit).all()

    for job in jobs:
        for cand in job.candidates:
            if cand.derivative_id and not getattr(cand, "crop_signed_url", None):
                cand.crop_signed_url = f"/api/v1/assets/derivatives/{cand.derivative_id}/file"

    return jobs


@router.get("/{job_id}", response_model=ProcessingJobResponse)
def get_job(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(ProcessingJob).filter(
        ProcessingJob.id == job_id,
        ProcessingJob.user_id == current_user.id
    ).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing job not found")

    for cand in job.candidates:
        if cand.derivative_id and not getattr(cand, "crop_signed_url", None):
            cand.crop_signed_url = f"/api/v1/assets/derivatives/{cand.derivative_id}/file"

    return job


@router.post("/{job_id}/retry", response_model=ProcessingJobResponse)
def retry_job(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(ProcessingJob).filter(
        ProcessingJob.id == job_id,
        ProcessingJob.user_id == current_user.id
    ).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing job not found")

    if job.retry_count >= job.max_retries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job {job_id} has exhausted its retry limit of {job.max_retries}"
        )

    if job.status not in ELIGIBLE_RETRY_STATUSES and job.status != "queued":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job in status '{job.status}' is not eligible for retry"
        )

    job.status = "queued"
    job.error_message = None
    job.claimed_at = None
    job.claimed_by = None
    job.retry_count += 1
    db.commit()
    db.refresh(job)
    return job


@router.post("/claim", response_model=JobClaimResponse)
def claim_job(
    worker_id: str = Query(..., min_length=1, description="Worker identifier claiming the job"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Atomically claims the next eligible queued job for processing.
    Ensures safe concurrency without race conditions.
    """
    # Look for candidate queued job for this user (or stale processing job)
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(seconds=300)

    candidate = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.user_id == current_user.id,
            or_(
                ProcessingJob.status == "queued",
                and_(
                    ProcessingJob.status == "processing",
                    ProcessingJob.claimed_at < stale_cutoff
                )
            )
        )
        .order_by(ProcessingJob.created_at.asc())
        .first()
    )

    if not candidate:
        return JobClaimResponse(claimed=False, job=None)

    # Atomic update with state condition
    updated_rows = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.id == candidate.id,
            or_(
                ProcessingJob.status == "queued",
                and_(
                    ProcessingJob.status == "processing",
                    ProcessingJob.claimed_at < stale_cutoff
                )
            )
        )
        .update(
            {
                "status": "processing",
                "claimed_at": now,
                "claimed_by": worker_id,
            },
            synchronize_session=False
        )
    )

    db.commit()

    if updated_rows > 0:
        db.refresh(candidate)
        return JobClaimResponse(
            claimed=True,
            job=ProcessingJobResponse.model_validate(candidate)
        )

    return JobClaimResponse(claimed=False, job=None)


@router.post("/recover-stale", response_model=StaleJobRecoveryResponse)
def recover_stale_jobs(
    timeout_seconds: int = Query(300, ge=30, le=3600),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Identifies jobs stranded in 'processing' due to worker restarts/crashes.
    Recovers eligible jobs back to 'queued' or marks them 'failed' if retries exhausted.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=timeout_seconds)

    stale_jobs = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.user_id == current_user.id,
            ProcessingJob.status == "processing",
            or_(
                ProcessingJob.claimed_at < cutoff,
                and_(ProcessingJob.claimed_at == None, ProcessingJob.updated_at < cutoff)
            )
        )
        .all()
    )

    recovered = 0
    failed = 0

    for job in stale_jobs:
        if job.retry_count < job.max_retries:
            job.status = "queued"
            job.claimed_at = None
            job.claimed_by = None
            job.retry_count += 1
            recovered += 1
        else:
            job.status = "failed"
            job.error_message = f"Job timed out after {timeout_seconds}s and reached maximum retries"
            failed += 1

    db.commit()
    return StaleJobRecoveryResponse(recovered_count=recovered, failed_count=failed)
