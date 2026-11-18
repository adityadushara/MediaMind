import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.entities import (
    SourceAsset,
    ProcessingJob,
    IdentificationCandidate,
    ImageDerivative,
    LibraryItem,
    ItemSource,
)



def test_list_and_count_review_candidates(client: TestClient, db_session: Session):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    headers = {"X-Dev-User-Id": user_id}

    asset = SourceAsset(
        id=asset_id,
        user_id=user_id,
        file_path="screenshots/test.jpg",
        file_name="test.jpg",
        file_size_bytes=1000,
        mime_type="image/jpeg",
        sha256_hash="hash_test_review",
    )
    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=asset_id,
        status="needs_review",
    )
    cand1 = IdentificationCandidate(
        id=str(uuid.uuid4()),
        job_id=job_id,
        source_asset_id=asset_id,
        user_id=user_id,
        suggested_title="Deep Work",
        suggested_creator="Cal Newport",
        suggested_type="book",
        review_status="needs_review",
        confidence_score=0.95,
        bounding_box={"x_min": 100, "y_min": 100, "x_max": 400, "y_max": 500},
    )
    cand2 = IdentificationCandidate(
        id=str(uuid.uuid4()),
        job_id=job_id,
        source_asset_id=asset_id,
        user_id=user_id,
        suggested_title="Huberman Lab",
        suggested_creator="Andrew Huberman",
        suggested_type="podcast",
        review_status="needs_review",
        confidence_score=0.88,
    )
    cand3 = IdentificationCandidate(
        id=str(uuid.uuid4()),
        job_id=job_id,
        source_asset_id=asset_id,
        user_id=user_id,
        suggested_title="Old Rejected Movie",
        suggested_type="movie",
        review_status="rejected",
    )

    db_session.add_all([asset, job, cand1, cand2, cand3])
    db_session.commit()

    # 1. Check counts endpoint
    res_counts = client.get("/api/v1/reviews/counts", headers=headers)
    assert res_counts.status_code == 200
    counts_data = res_counts.json()
    assert counts_data["pending_review"] == 2
    assert counts_data["rejected"] == 1
    assert counts_data["total"] == 3

    # 2. Check list endpoint with default filter (needs_review)
    res_list = client.get("/api/v1/reviews/candidates", headers=headers)
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    titles = [item["suggested_title"] for item in data["items"]]
    assert "Deep Work" in titles
    assert "Huberman Lab" in titles

    # 3. Filter by content_type
    res_filter = client.get("/api/v1/reviews/candidates?content_type=book", headers=headers)
    assert res_filter.status_code == 200
    filter_data = res_filter.json()
    assert filter_data["total"] == 1
    assert filter_data["items"][0]["suggested_title"] == "Deep Work"


def test_candidate_detail_and_update(client: TestClient, db_session: Session):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    cand_id = str(uuid.uuid4())
    deriv_id = str(uuid.uuid4())
    headers = {"X-Dev-User-Id": user_id}

    asset = SourceAsset(
        id=asset_id,
        user_id=user_id,
        file_path="screenshots/detail.jpg",
        file_name="detail.jpg",
        file_size_bytes=500,
        mime_type="image/jpeg",
        sha256_hash="hash_detail",
    )
    deriv = ImageDerivative(
        id=deriv_id,
        user_id=user_id,
        source_asset_id=asset_id,
        derivative_type="region_crop",
        storage_path=f"screenshots/{user_id}/derivatives/{deriv_id}.jpg",
        file_name=f"{deriv_id}.jpg",
        file_size_bytes=200,
        mime_type="image/jpeg",
        image_width=200,
        image_height=200,
    )
    cand = IdentificationCandidate(
        id=cand_id,
        job_id=job_id,
        source_asset_id=asset_id,
        user_id=user_id,
        derivative_id=deriv_id,
        suggested_title="Draft Title",
        suggested_creator="Unknown",
        suggested_type="other",
        review_status="needs_review",
    )
    db_session.add_all([asset, deriv, cand])
    db_session.commit()

    # Get Detail
    res_get = client.get(f"/api/v1/reviews/candidates/{cand_id}", headers=headers)
    assert res_get.status_code == 200
    detail = res_get.json()
    assert detail["suggested_title"] == "Draft Title"
    assert detail["source_signed_url"] is not None
    assert detail["crop_signed_url"] is not None

    # Patch / Update Candidate
    patch_payload = {
        "suggested_title": "Atomic Habits",
        "suggested_creator": "James Clear",
        "suggested_type": "book",
        "year_clue": 2018,
    }
    res_patch = client.patch(f"/api/v1/reviews/candidates/{cand_id}", json=patch_payload, headers=headers)
    assert res_patch.status_code == 200
    updated = res_patch.json()
    assert updated["suggested_title"] == "Atomic Habits"
    assert updated["suggested_creator"] == "James Clear"
    assert updated["suggested_type"] == "book"
    assert updated["year_clue"] == 2018


def test_accept_candidate_creates_library_item_and_traceable_link(client: TestClient, db_session: Session):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    cand_id = str(uuid.uuid4())
    headers = {"X-Dev-User-Id": user_id}

    asset = SourceAsset(
        id=asset_id,
        user_id=user_id,
        file_path="screenshots/accept.jpg",
        file_name="accept.jpg",
        file_size_bytes=1000,
        mime_type="image/jpeg",
        sha256_hash="hash_accept",
    )
    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=asset_id,
        status="needs_review",
    )
    cand = IdentificationCandidate(
        id=cand_id,
        job_id=job_id,
        source_asset_id=asset_id,
        user_id=user_id,
        suggested_title="Thinking, Fast and Slow",
        suggested_creator="Daniel Kahneman",
        suggested_type="book",
        year_clue=2011,
        confidence_score=0.91,
        bounding_box={"x_min": 50, "y_min": 50, "x_max": 450, "y_max": 650},
        review_status="needs_review",
    )
    db_session.add_all([asset, job, cand])
    db_session.commit()

    accept_payload = {
        "title": "Thinking, Fast and Slow (Revised Edition)",
        "consumption_status": "completed",
        "user_rating": 9.5,
    }
    res_accept = client.post(f"/api/v1/reviews/candidates/{cand_id}/accept", json=accept_payload, headers=headers)
    assert res_accept.status_code == 200
    lib_item_data = res_accept.json()
    assert lib_item_data["title"] == "Thinking, Fast and Slow (Revised Edition)"
    assert lib_item_data["creator"] == "Daniel Kahneman"
    assert lib_item_data["content_type"] == "book"
    assert lib_item_data["consumption_status"] == "completed"
    assert lib_item_data["verification_status"] == "verified"
    assert lib_item_data["user_rating"] == 9.5

    # Verify DB state
    db_item = db_session.query(LibraryItem).filter(LibraryItem.id == lib_item_data["id"]).first()
    assert db_item is not None

    # Verify ItemSource traceability
    item_source = db_session.query(ItemSource).filter(
        ItemSource.library_item_id == db_item.id,
        ItemSource.source_asset_id == asset_id,
    ).first()
    assert item_source is not None
    assert item_source.crop_coordinates["x_min"] == 50

    # Verify Candidate resolution
    db_session.refresh(cand)
    assert cand.review_status == "accepted"
    assert cand.resolution_status == "resolved"
    assert cand.resolved_library_item_id == db_item.id

    # Verify parent job transitioned to 'identified' since all candidates resolved
    db_session.refresh(job)
    assert job.status == "identified"


def test_reject_candidate_preserves_source(client: TestClient, db_session: Session):
    user_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    cand_id = str(uuid.uuid4())
    headers = {"X-Dev-User-Id": user_id}

    asset = SourceAsset(
        id=asset_id,
        user_id=user_id,
        file_path="screenshots/reject.jpg",
        file_name="reject.jpg",
        file_size_bytes=800,
        mime_type="image/jpeg",
        sha256_hash="hash_reject",
    )
    job = ProcessingJob(
        id=job_id,
        user_id=user_id,
        source_asset_id=asset_id,
        status="needs_review",
    )
    cand = IdentificationCandidate(
        id=cand_id,
        job_id=job_id,
        source_asset_id=asset_id,
        user_id=user_id,
        suggested_title="Spam Ad Banner",
        suggested_type="other",
        review_status="needs_review",
    )
    db_session.add_all([asset, job, cand])
    db_session.commit()

    res_reject = client.post(f"/api/v1/reviews/candidates/{cand_id}/reject", headers=headers)
    assert res_reject.status_code == 200
    reject_data = res_reject.json()
    assert reject_data["success"] is True
    assert reject_data["review_status"] == "rejected"

    db_session.refresh(cand)
    assert cand.review_status == "rejected"
    assert cand.resolution_status == "resolved"

    # SourceAsset remains completely intact
    persisted_asset = db_session.query(SourceAsset).filter(SourceAsset.id == asset_id).first()
    assert persisted_asset is not None
    assert persisted_asset.file_path == "screenshots/reject.jpg"


def test_cross_user_candidate_review_isolation(client: TestClient, db_session: Session):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    cand_id = str(uuid.uuid4())

    cand = IdentificationCandidate(
        id=cand_id,
        job_id=str(uuid.uuid4()),
        source_asset_id=str(uuid.uuid4()),
        user_id=user_a,
        suggested_title="Private Item",
        suggested_type="book",
        review_status="needs_review",
    )
    db_session.add(cand)
    db_session.commit()

    # User B attempts to access User A's candidate
    headers_b = {"X-Dev-User-Id": user_b}

    res_get = client.get(f"/api/v1/reviews/candidates/{cand_id}", headers=headers_b)
    assert res_get.status_code == 404

    res_patch = client.patch(f"/api/v1/reviews/candidates/{cand_id}", json={"suggested_title": "Hacked"}, headers=headers_b)
    assert res_patch.status_code == 404

    res_accept = client.post(f"/api/v1/reviews/candidates/{cand_id}/accept", json={"title": "Hacked"}, headers=headers_b)
    assert res_accept.status_code == 404

    res_reject = client.post(f"/api/v1/reviews/candidates/{cand_id}/reject", headers=headers_b)
    assert res_reject.status_code == 404
