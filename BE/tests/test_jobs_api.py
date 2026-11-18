import io
from datetime import datetime, timezone, timedelta
from PIL import Image
from app.models.entities import ProcessingJob


def generate_test_image() -> bytes:
    img = Image.new("RGB", (100, 100), color="yellow")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_job_lifecycle_and_retry_limits(client, db_session):
    img = generate_test_image()
    res = client.post("/api/v1/assets/upload", files=[("files", ("test.png", io.BytesIO(img), "image/png"))])
    job_id = res.json()["assets"][0]["job_id"]

    # Initial status is awaiting_identification
    get_res = client.get(f"/api/v1/jobs/{job_id}")
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "awaiting_identification"
    assert get_res.json()["retry_count"] == 0
    assert get_res.json()["max_retries"] == 3

    # Retry eligible job: transitions to queued and increments retry_count
    retry_res = client.post(f"/api/v1/jobs/{job_id}/retry")
    assert retry_res.status_code == 200
    assert retry_res.json()["status"] == "queued"
    assert retry_res.json()["retry_count"] == 1

    # Simulate exhausting max_retries
    job = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    job.retry_count = 3
    db_session.commit()

    # Further retry must be rejected with 400 Bad Request
    fail_retry = client.post(f"/api/v1/jobs/{job_id}/retry")
    assert fail_retry.status_code == 400
    assert "exhausted its retry limit" in fail_retry.text


def test_job_atomic_claiming(client, db_session):
    img = generate_test_image()
    res = client.post("/api/v1/assets/upload", files=[("files", ("claim_test.png", io.BytesIO(img), "image/png"))])
    job_id = res.json()["assets"][0]["job_id"]

    # Put job in queued state
    job = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    job.status = "queued"
    db_session.commit()

    # Worker 1 claims the job
    claim_res = client.post("/api/v1/jobs/claim?worker_id=worker-node-1")
    assert claim_res.status_code == 200
    claim_data = claim_res.json()
    assert claim_data["claimed"] is True
    assert claim_data["job"]["status"] == "processing"
    assert claim_data["job"]["claimed_by"] == "worker-node-1"

    # Worker 2 attempts to claim next job -> no queued jobs available
    claim_res_2 = client.post("/api/v1/jobs/claim?worker_id=worker-node-2")
    assert claim_res_2.status_code == 200
    assert claim_res_2.json()["claimed"] is False


def test_stale_job_recovery(client, db_session):
    img = generate_test_image()
    res = client.post("/api/v1/assets/upload", files=[("files", ("stale_test.png", io.BytesIO(img), "image/png"))])
    job_id = res.json()["assets"][0]["job_id"]

    # Manually simulate a job stuck in 'processing' from 10 minutes ago
    ten_min_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
    job = db_session.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    job.status = "processing"
    job.claimed_at = ten_min_ago
    job.claimed_by = "dead-worker"
    job.retry_count = 0
    db_session.commit()

    # Run stale recovery
    recovery_res = client.post("/api/v1/jobs/recover-stale?timeout_seconds=300")
    assert recovery_res.status_code == 200
    assert recovery_res.json()["recovered_count"] >= 1

    # Confirm job is reset to 'queued' and retry count incremented
    db_session.refresh(job)
    assert job.status == "queued"
    assert job.retry_count == 1
    assert job.claimed_by is None


def test_cross_user_job_isolation(client):
    user_a = "user-a-jobs-1111"
    user_b = "user-b-jobs-2222"

    img = generate_test_image()
    res = client.post(
        "/api/v1/assets/upload",
        files=[("files", ("job_iso.png", io.BytesIO(img), "image/png"))],
        headers={"X-Dev-User-Id": user_a}
    )
    job_id_a = res.json()["assets"][0]["job_id"]

    # User B cannot get User A's job
    res_b = client.get(f"/api/v1/jobs/{job_id_a}", headers={"X-Dev-User-Id": user_b})
    assert res_b.status_code == 404

    # User B cannot retry User A's job
    res_b_retry = client.post(f"/api/v1/jobs/{job_id_a}/retry", headers={"X-Dev-User-Id": user_b})
    assert res_b_retry.status_code == 404
