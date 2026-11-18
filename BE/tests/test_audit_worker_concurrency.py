import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import io
import uuid
from unittest.mock import MagicMock, AsyncMock
from PIL import Image
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.db.session import Base
from app.models.entities import (
    ProcessingJob,
    SourceAsset,
    ProcessingRun,
    ImageDerivative,
    IdentificationCandidate,
)
from app.adapters.storage.local import LocalStorageAdapter
from app.adapters.ai.gemini_adapter import GeminiExtractionResult
from app.schemas.common import GeminiCandidateOutput, BoundingBox
from app.worker.runner import claim_next_job, recover_stale_jobs, process_job, heartbeat_job


# --------------------------------------------------------------------------
# 12 WORKER CONCURRENCY & LEASE TOKEN TESTS
# --------------------------------------------------------------------------

def test_01_queued_job_claimed_with_lease_token(db_session: Session):
    """
    Test 1: Queued job is claimed and receives a unique lease_token UUID.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="queued",
        retry_count=0,
        max_retries=3,
    )
    db_session.add(job)
    db_session.commit()

    claimed = claim_next_job(db_session, worker_id="worker-test-1", lease_seconds=300)
    assert claimed is not None
    assert claimed.id == job_id
    assert claimed.status == "processing"
    assert claimed.claimed_by == "worker-test-1"
    assert claimed.lease_token is not None
    assert len(claimed.lease_token) == 36  # Valid UUID string format


def test_02_active_lease_cannot_be_reclaimed(db_session: Session):
    """
    Test 2: An active lease within the lease duration cannot be claimed by another worker.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="processing",
        claimed_at=datetime.now(timezone.utc) - timedelta(seconds=30),  # Active (30s old, 300s lease)
        claimed_by="worker-primary",
        lease_token=str(uuid.uuid4()),
        retry_count=0,
        max_retries=3,
    )
    db_session.add(job)
    db_session.commit()

    # Second worker attempts to claim
    second_claim = claim_next_job(db_session, worker_id="worker-intruder", lease_seconds=300)
    assert second_claim is None


def test_03_expired_lease_can_be_reclaimed_with_new_token(db_session: Session):
    """
    Test 3: An expired lease (> 300s old) can be claimed and gets a new distinct lease_token.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    old_lease_token = str(uuid.uuid4())

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="processing",
        claimed_at=datetime.now(timezone.utc) - timedelta(seconds=400),  # Expired lease
        claimed_by="worker-dead",
        lease_token=old_lease_token,
        retry_count=0,
        max_retries=3,
    )
    db_session.add(job)
    db_session.commit()

    reclaimed = claim_next_job(db_session, worker_id="worker-rescuer", lease_seconds=300)
    assert reclaimed is not None
    assert reclaimed.id == job_id
    assert reclaimed.claimed_by == "worker-rescuer"
    assert reclaimed.lease_token is not None
    assert reclaimed.lease_token != old_lease_token


def test_04_completed_job_cannot_be_claimed(db_session: Session):
    """
    Test 4: Completed/identified jobs cannot be claimed from the queue.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="completed",
        retry_count=0,
        max_retries=3,
    )
    db_session.add(job)
    db_session.commit()

    claimed = claim_next_job(db_session, worker_id="worker-test", lease_seconds=300)
    assert claimed is None


def test_05_failed_job_cannot_be_claimed(db_session: Session):
    """
    Test 5: Failed jobs (exceeded max retries or fatal error) cannot be claimed.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="failed",
        retry_count=3,
        max_retries=3,
        error_message="Exceeded max retries",
    )
    db_session.add(job)
    db_session.commit()

    claimed = claim_next_job(db_session, worker_id="worker-test", lease_seconds=300)
    assert claimed is None


def test_06_concurrent_worker_race_atomic_claim(tmp_path):
    """
    Test 6: Multiple concurrent worker threads racing to claim the same queued job;
    exactly ONE worker succeeds, while all other threads receive None.
    """
    db_file = tmp_path / "test_concurrency_race.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False, "timeout": 30})
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    with session_factory() as init_session:
        job = ProcessingJob(
            id=job_id,
            user_id=user_id,
            source_asset_id=str(uuid.uuid4()),
            status="queued",
            retry_count=0,
            max_retries=3,
        )
        init_session.add(job)
        init_session.commit()

    claimed_results = []

    def worker_claim_attempt(worker_idx: int):
        with session_factory() as session:
            claimed = claim_next_job(session, worker_id=f"worker-concurrent-{worker_idx}", lease_seconds=300)
            return (claimed.id, claimed.lease_token) if claimed else None

    # Spawn 5 concurrent threads
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(worker_claim_attempt, i) for i in range(5)]
        for f in futures:
            claimed_results.append(f.result())

    successful_claims = [res for res in claimed_results if res is not None]
    assert len(successful_claims) == 1
    assert successful_claims[0][0] == job_id
    assert successful_claims[0][1] is not None
    assert claimed_results.count(None) == 4


def test_07_expired_superseded_token_cannot_send_heartbeat(db_session: Session):
    """
    Test 7: A worker presenting an expired or superseded lease_token cannot extend the lease.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    current_token = str(uuid.uuid4())
    stale_token = str(uuid.uuid4())

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="processing",
        claimed_at=datetime.now(timezone.utc),
        claimed_by="worker-current",
        lease_token=current_token,
    )
    db_session.add(job)
    db_session.commit()

    # Worker with stale token attempts heartbeat -> rejected
    rejected = heartbeat_job(db_session, job_id=job_id, lease_token=stale_token)
    assert rejected is False


def test_08_expired_superseded_token_cannot_complete_job(tmp_path):
    """
    Test 8: A worker with an outdated lease token cannot complete the job and overwrite state.
    """
    db_file = tmp_path / "test_superseded_complete.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    new_active_token = str(uuid.uuid4())
    stale_token = str(uuid.uuid4())

    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(10, 20, 30)).save(buf, format="JPEG")
    img_bytes = buf.getvalue()
    mock_storage = MagicMock()
    mock_storage.download_file = AsyncMock(return_value=img_bytes)

    with session_factory() as init_session:
        asset = SourceAsset(
            id=asset_id,
            user_id=user_id,
            file_path="screenshots/test.jpg",
            file_name="test.jpg",
            file_size_bytes=len(img_bytes),
            mime_type="image/jpeg",
            sha256_hash="hash_test_superseded",
        )
        job = ProcessingJob(
            id=job_id,
            user_id=user_id,
            source_asset_id=asset_id,
            status="processing",
            claimed_at=datetime.now(timezone.utc),
            claimed_by="worker-new",
            lease_token=new_active_token,  # Active token belongs to worker-new
        )
        init_session.add(asset)
        init_session.add(job)
        init_session.commit()

    mock_ai = MagicMock()
    mock_ai.extract_candidates.return_value = GeminiExtractionResult(
        candidates=[
            GeminiCandidateOutput(
                content_type="book",
                title="Stale Worker Result",
                confidence=0.8,
            )
        ],
        prompt_identifier="gemini_multimodal_extraction",
        prompt_version="v1.0.0",
        ai_model_name="gemini-3.5-flash-lite",
        duration_ms=100,
    )

    # Worker with stale token attempts completion
    with session_factory() as session:
        success = process_job(
            job_id=job_id,
            db=session,
            storage_adapter=mock_storage,
            ai_adapter=mock_ai,
            worker_id="worker-stale",
            lease_token=stale_token,
        )
        assert success is False

    # Verify job in DB still retains new_active_token and was not completed by stale worker
    with session_factory() as verify_session:
        job_db = verify_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        assert job_db.lease_token == new_active_token
        assert job_db.claimed_by == "worker-new"
        assert job_db.status == "processing"


def test_09_expired_superseded_token_cannot_persist_candidates(tmp_path):
    """
    Test 9: If lease is superseded midway through execution, candidate persistence is aborted.
    """
    db_file = tmp_path / "test_superseded_candidates.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    original_token = str(uuid.uuid4())
    new_token = str(uuid.uuid4())

    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(10, 20, 30)).save(buf, format="JPEG")
    img_bytes = buf.getvalue()
    mock_storage = MagicMock()
    mock_storage.download_file = AsyncMock(return_value=img_bytes)

    with session_factory() as init_session:
        asset = SourceAsset(
            id=asset_id,
            user_id=user_id,
            file_path="screenshots/test.jpg",
            file_name="test.jpg",
            file_size_bytes=len(img_bytes),
            mime_type="image/jpeg",
            sha256_hash="hash_test_cands",
        )
        job = ProcessingJob(
            id=job_id,
            user_id=user_id,
            source_asset_id=asset_id,
            status="processing",
            claimed_at=datetime.now(timezone.utc),
            claimed_by="worker-original",
            lease_token=original_token,
        )
        init_session.add(asset)
        init_session.add(job)
        init_session.commit()

    # Simulate midway lease takeover by modifying lease_token in DB before extraction completes
    def fake_extract(*args, **kwargs):
        with session_factory() as hijack_session:
            hijack_job = hijack_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
            hijack_job.lease_token = new_token
            hijack_job.claimed_by = "worker-hijacker"
            hijack_session.commit()
        return GeminiExtractionResult(
            candidates=[
                GeminiCandidateOutput(
                    content_type="book",
                    title="Orphan Candidate",
                    confidence=0.9,
                )
            ],
            prompt_identifier="gemini_multimodal_extraction",
            prompt_version="v1.0.0",
            ai_model_name="gemini-3.5-flash-lite",
            duration_ms=100,
        )

    mock_ai = MagicMock()
    mock_ai.extract_candidates.side_effect = fake_extract

    with session_factory() as session:
        success = process_job(
            job_id=job_id,
            db=session,
            storage_adapter=mock_storage,
            ai_adapter=mock_ai,
            worker_id="worker-original",
            lease_token=original_token,
        )
        assert success is False

    # Check that candidate was NOT committed into database
    with session_factory() as verify_session:
        cands = verify_session.query(IdentificationCandidate).filter(IdentificationCandidate.job_id == job_id).all()
        assert len(cands) == 0


def test_10_valid_lease_token_can_heartbeat(db_session: Session):
    """
    Test 10: Worker with valid lease_token extends heartbeat timestamp.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    valid_token = str(uuid.uuid4())
    initial_time = datetime.now(timezone.utc) - timedelta(seconds=120)

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="processing",
        claimed_at=initial_time,
        claimed_by="worker-legit",
        lease_token=valid_token,
    )
    db_session.add(job)
    db_session.commit()

    success = heartbeat_job(db_session, job_id=job_id, lease_token=valid_token)
    assert success is True

    db_session.refresh(job)
    claimed_at_utc = job.claimed_at if job.claimed_at.tzinfo else job.claimed_at.replace(tzinfo=timezone.utc)
    assert claimed_at_utc > initial_time


def test_11_valid_lease_token_can_complete_job(tmp_path):
    """
    Test 11: Worker with valid lease_token successfully processes and completes the job.
    """
    db_file = tmp_path / "test_valid_complete.db"
    db_url = f"sqlite:///{db_file}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    valid_token = str(uuid.uuid4())

    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(10, 20, 30)).save(buf, format="JPEG")
    img_bytes = buf.getvalue()
    mock_storage = MagicMock()
    mock_storage.download_file = AsyncMock(return_value=img_bytes)

    with session_factory() as init_session:
        asset = SourceAsset(
            id=asset_id,
            user_id=user_id,
            file_path="screenshots/valid.jpg",
            file_name="valid.jpg",
            file_size_bytes=len(img_bytes),
            mime_type="image/jpeg",
            sha256_hash="hash_valid_complete",
        )
        job = ProcessingJob(
            id=job_id,
            user_id=user_id,
            source_asset_id=asset_id,
            status="processing",
            claimed_at=datetime.now(timezone.utc),
            claimed_by="worker-legit",
            lease_token=valid_token,
        )
        init_session.add(asset)
        init_session.add(job)
        init_session.commit()

    mock_ai = MagicMock()
    mock_ai.extract_candidates.return_value = GeminiExtractionResult(
        candidates=[
            GeminiCandidateOutput(
                content_type="book",
                title="Verified Completion",
                confidence=0.95,
            )
        ],
        prompt_identifier="gemini_multimodal_extraction",
        prompt_version="v1.0.0",
        ai_model_name="gemini-3.5-flash-lite",
        duration_ms=150,
    )

    with session_factory() as session:
        success = process_job(
            job_id=job_id,
            db=session,
            storage_adapter=mock_storage,
            ai_adapter=mock_ai,
            worker_id="worker-legit",
            lease_token=valid_token,
        )
        assert success is True

    with session_factory() as verify_session:
        job_db = verify_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        assert job_db.status == "needs_review"
        assert job_db.processing_time_ms == 150
        cands = verify_session.query(IdentificationCandidate).filter(IdentificationCandidate.job_id == job_id).all()
        assert len(cands) == 1
        assert cands[0].suggested_title == "Verified Completion"


def test_12_stale_recovery_resets_lease_token_to_none(db_session: Session):
    """
    Test 12: Stale job recovery clears the lease_token, resets status to 'queued', and increments retries.
    """
    user_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    expired_time = datetime.now(timezone.utc) - timedelta(seconds=600)

    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=str(uuid.uuid4()),
        status="processing",
        claimed_at=expired_time,
        claimed_by="worker-crashed",
        lease_token=str(uuid.uuid4()),
        retry_count=0,
        max_retries=3,
    )
    db_session.add(job)
    db_session.commit()

    recovered_count = recover_stale_jobs(db_session, lease_seconds=300)
    assert recovered_count == 1

    db_session.refresh(job)
    assert job.status == "queued"
    assert job.claimed_at is None
    assert job.claimed_by is None
    assert job.lease_token is None
    assert job.retry_count == 1
