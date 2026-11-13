from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.models.entities import ProcessingJob
from app.schemas.common import ProcessingJobResponse

router = APIRouter(prefix="/jobs", tags=["Processing Jobs"])


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

    job.status = "queued"
    job.error_message = None
    job.retry_count += 1
    db.commit()
    db.refresh(job)
    return job
