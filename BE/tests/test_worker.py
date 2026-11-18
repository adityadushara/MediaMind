import asyncio
from datetime import datetime, timezone, timedelta
import io
import uuid
from unittest.mock import MagicMock, patch
from PIL import Image

import pytest
from sqlalchemy.orm import Session

from app.models.entities import (
    ProcessingJob,
    SourceAsset,
    ProcessingRun,
    ImageDerivative,
    IdentificationCandidate,
)
from app.schemas.common import GeminiCandidateOutput, BoundingBox
from app.adapters.ai.gemini_adapter import GeminiExtractionResult
from app.adapters.storage.local import LocalStorageAdapter
from app.worker.runner import claim_next_job, recover_stale_jobs, process_job


def _create_synthetic_test_image_bytes(width: int = 400, height: int = 300) -> bytes:
    img = Image.new("RGB", (width, height), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_worker_claim_queued_job(db_session: Session):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())

    job = ProcessingJob(
        id=str(uuid.uuid4()),
        user_id=user_id,
        source_asset_id=asset_id,
        status="queued",
        retry_count=0,
        max_retries=3,
    )
    db_session.add(job)
    db_session.commit()

    # Claim the job
    claimed = claim_next_job(db_session, worker_id="test-worker-1", lease_seconds=300)
    assert claimed is not None
    assert claimed.id == job.id
    assert claimed.status == "processing"
    assert claimed.claimed_by == "test-worker-1"
    assert claimed.claimed_at is not None

    # Next claim should return None since queue is empty
    claimed_again = claim_next_job(db_session, worker_id="test-worker-2", lease_seconds=300)
    assert claimed_again is None


def test_worker_process_job_end_to_end(db_session: Session, tmp_path):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # Set up storage in temporary directory
    storage = LocalStorageAdapter(base_path=str(tmp_path / "storage"))
    img_bytes = _create_synthetic_test_image_bytes(500, 400)
    asset_path = f"screenshots/{user_id}/original_{asset_id}.jpg"
    asyncio.run(storage.upload_file(asset_path, img_bytes, "image/jpeg"))

    # Create SourceAsset and ProcessingJob
    asset = SourceAsset(
        id=asset_id,
        user_id=user_id,
        file_path=asset_path,
        file_name="screenshot.jpg",
        file_size_bytes=len(img_bytes),
        mime_type="image/jpeg",
        sha256_hash="dummy_hash_m3",
    )
    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=asset_id,
        status="processing",
        claimed_by="worker-1",
        claimed_at=datetime.now(timezone.utc),
        retry_count=0,
        max_retries=3,
    )
    db_session.add(asset)
    db_session.add(job)
    db_session.commit()

    # Mock Gemini AI response
    mock_candidates = [
        GeminiCandidateOutput(
            content_type="book",
            title="Clean Architecture",
            creator="Robert C. Martin",
            confidence=0.92,
            bounding_box=BoundingBox(x_min=100, y_min=100, x_max=500, y_max=600),
            visible_text=["Clean Architecture", "Robert Martin"],
            identifying_clues=["Book cover with title and author name"],
        ),
        GeminiCandidateOutput(
            content_type="podcast",
            title="Software Engineering Daily",
            creator="Jeff Meyerson",
            confidence=0.85,
            bounding_box=None,
        ),
    ]
    mock_extraction = GeminiExtractionResult(
        candidates=mock_candidates,
        prompt_identifier="gemini_multimodal_extraction",
        prompt_version="v1.0.0",
        ai_model_name="gemini-2.5-flash",
        duration_ms=450,
        prompt_tokens=250,
        candidate_tokens=120,
        total_tokens=370,
        estimated_cost_usd=0.000055,
        raw_response_text="{}",
    )

    mock_ai_adapter = MagicMock()
    mock_ai_adapter.extract_candidates.return_value = mock_extraction

    success = process_job(
        job_id=job_id,
        db=db_session,
        storage_adapter=storage,
        ai_adapter=mock_ai_adapter,
    )

    assert success is True

    # Verify Job updated to needs_review
    refreshed_job = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    assert refreshed_job.status == "needs_review"
    assert refreshed_job.processing_time_ms == 450
    assert refreshed_job.updated_at is not None

    # Verify ProcessingRun record created
    run = db_session.query(ProcessingRun).filter(ProcessingRun.job_id == job_id).first()
    assert run is not None
    assert run.status == "completed"
    assert run.total_tokens == 370
    assert run.ai_model_name == "gemini-2.5-flash"
    assert float(run.estimated_cost_usd) == 0.000055

    # Verify ImageDerivative created for the candidate with bounding box
    derivatives = db_session.query(ImageDerivative).filter(ImageDerivative.source_asset_id == asset_id).all()
    assert len(derivatives) == 1
    deriv = derivatives[0]
    assert deriv.derivative_type == "region_crop"
    assert deriv.bounding_box["x_min"] == 100
    assert deriv.bounding_box["x_max"] == 500
    # Derivative crop file exists in storage
    assert (tmp_path / "storage" / deriv.storage_path).exists()

    # Verify Candidates created
    candidates = db_session.query(IdentificationCandidate).filter(IdentificationCandidate.job_id == job_id).all()
    assert len(candidates) == 2

    book_cand = next(c for c in candidates if c.suggested_title == "Clean Architecture")
    assert book_cand.suggested_type == "book"
    assert book_cand.suggested_creator == "Robert C. Martin"
    assert book_cand.review_status == "needs_review"
    assert book_cand.derivative_id == deriv.id

    podcast_cand = next(c for c in candidates if c.suggested_title == "Software Engineering Daily")
    assert podcast_cand.suggested_type == "podcast"
    assert podcast_cand.derivative_id is None

    # Verify original screenshot bytes remain unaltered
    persisted_original = asyncio.run(storage.download_file(asset_path))
    assert persisted_original == img_bytes


def test_worker_transient_failure_and_retry(db_session: Session, tmp_path):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    storage = LocalStorageAdapter(base_path=str(tmp_path / "storage"))
    img_bytes = _create_synthetic_test_image_bytes(200, 200)
    asset_path = f"screenshots/{user_id}/original_{asset_id}.jpg"
    asyncio.run(storage.upload_file(asset_path, img_bytes, "image/jpeg"))

    asset = SourceAsset(
        id=asset_id,
        user_id=user_id,
        file_path=asset_path,
        file_name="screenshot.jpg",
        file_size_bytes=len(img_bytes),
        mime_type="image/jpeg",
        sha256_hash="dummy_hash_retry",
    )
    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=asset_id,
        status="processing",
        retry_count=0,
        max_retries=2,
    )
    db_session.add(asset)
    db_session.add(job)
    db_session.commit()

    # Mock error response from Gemini
    mock_error_res = GeminiExtractionResult(
        candidates=[],
        prompt_identifier="gemini_multimodal_extraction",
        prompt_version="v1.0.0",
        ai_model_name="gemini-2.5-flash",
        duration_ms=100,
        error_category="rate_limit",
        error_message="Resource exhausted 429",
    )
    mock_ai = MagicMock()
    mock_ai.extract_candidates.return_value = mock_error_res

    # 1. First failure -> job should be re-queued
    success_1 = process_job(job_id=job_id, db=db_session, storage_adapter=storage, ai_adapter=mock_ai)
    assert success_1 is False

    refreshed_1 = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    assert refreshed_1.status == "queued"
    assert refreshed_1.retry_count == 1
    assert refreshed_1.claimed_at is None

    # 2. Second failure when claimed again -> job reaches max_retries and fails
    refreshed_1.status = "processing"
    db_session.commit()

    success_2 = process_job(job_id=job_id, db=db_session, storage_adapter=storage, ai_adapter=mock_ai)
    assert success_2 is False

    refreshed_2 = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    assert refreshed_2.status == "failed"
    assert refreshed_2.retry_count == 2
    assert "Resource exhausted" in refreshed_2.error_message


def test_worker_stale_recovery(db_session: Session):
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    past_time = datetime.now(timezone.utc) - timedelta(seconds=600)
    stale_job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="processing",
        claimed_at=past_time,
        claimed_by="crashed-worker",
        retry_count=0,
        max_retries=3,
    )
    db_session.add(stale_job)
    db_session.commit()

    recovered_count = recover_stale_jobs(db_session, lease_seconds=300)
    assert recovered_count == 1

    refreshed = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    assert refreshed.status == "queued"
    assert refreshed.claimed_at is None
    assert refreshed.claimed_by is None
    assert refreshed.retry_count == 1


def test_worker_tenant_mismatch_prevention(db_session: Session):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # Asset belongs to user_a
    asset = SourceAsset(
        id=asset_id,
        user_id=user_a,
        file_path="screenshots/user_a/test.jpg",
        file_name="test.jpg",
        file_size_bytes=100,
        mime_type="image/jpeg",
        sha256_hash="hash_user_a",
    )
    # Job belongs to user_b, but attempts to reference user_a's asset
    job = ProcessingJob(
        id=job_id,
        user_id=user_b,
        source_asset_id=asset_id,
        status="processing",
        retry_count=0,
        max_retries=3,
    )
    db_session.add(asset)
    db_session.add(job)
    db_session.commit()

    success = process_job(job_id=job_id, db=db_session)
    assert success is False

    refreshed_job = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    assert refreshed_job.status == "failed"
    assert "user mismatch" in refreshed_job.error_message
