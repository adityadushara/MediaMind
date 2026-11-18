import pytest
import uuid
from app.db.session import SessionLocal, engine, Base
from app.models.entities import (
    LibraryItem,
    IdentificationCandidate,
    ItemSource,
    SourceAsset,
    ProcessingJob,
    Profile,
)
from app.api.v1.reviews import accept_candidate
from app.schemas.common import ReviewAcceptRequest
from app.core.security import AuthenticatedUser


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


def test_deduplication_multi_source_linking(db_session):
    user_id = str(uuid.uuid4())
    # Create profile
    profile = Profile(id=user_id, display_name="Test User")
    db_session.add(profile)

    # 1. First screenshot upload and candidate
    asset1 = SourceAsset(
        id=str(uuid.uuid4()),
        user_id=user_id,
        file_name="screenshot_reel_1.jpg",
        file_path=f"screenshots/{user_id}/s1.jpg",
        file_size_bytes=1000,
        mime_type="image/jpeg",
        sha256_hash="hash1",
    )
    job1 = ProcessingJob(
        id=str(uuid.uuid4()),
        user_id=user_id,
        source_asset_id=asset1.id,
        status="needs_review",
    )
    cand1 = IdentificationCandidate(
        id=str(uuid.uuid4()),
        job_id=job1.id,
        source_asset_id=asset1.id,
        user_id=user_id,
        suggested_title="Atomic Habits",
        suggested_creator="James Clear",
        suggested_type="book",
        provider_candidates=[
            {
                "record": {
                    "provider_name": "google_books",
                    "external_id": "vol_atomic_habits_123",
                    "title": "Atomic Habits",
                    "creator": "James Clear",
                    "isbn": "9780735211292",
                    "genre": "Self-Help",
                    "cover_image_url": "https://books.google.com/cover.jpg",
                }
            }
        ],
    )
    db_session.add_all([asset1, job1, cand1])
    db_session.commit()

    # User approves first candidate
    auth_user = AuthenticatedUser(user_id=user_id, role="user")
    req1 = ReviewAcceptRequest(title="Atomic Habits", creator="James Clear")
    resp1 = accept_candidate(cand1.id, req1, current_user=auth_user, db=db_session)

    item1_id = resp1.id
    assert db_session.query(LibraryItem).filter(LibraryItem.user_id == user_id).count() == 1
    assert db_session.query(ItemSource).filter(ItemSource.library_item_id == item1_id).count() == 1

    # 2. Second screenshot from a different post (same book!)
    asset2 = SourceAsset(
        id=str(uuid.uuid4()),
        user_id=user_id,
        file_name="screenshot_youtube_2.jpg",
        file_path=f"screenshots/{user_id}/s2.jpg",
        file_size_bytes=1500,
        mime_type="image/jpeg",
        sha256_hash="hash2",
    )
    job2 = ProcessingJob(
        id=str(uuid.uuid4()),
        user_id=user_id,
        source_asset_id=asset2.id,
        status="needs_review",
    )
    cand2 = IdentificationCandidate(
        id=str(uuid.uuid4()),
        job_id=job2.id,
        source_asset_id=asset2.id,
        user_id=user_id,
        suggested_title="Atomic Habits",
        suggested_creator="James Clear",
        suggested_type="book",
        provider_candidates=[
            {
                "record": {
                    "provider_name": "google_books",
                    "external_id": "vol_atomic_habits_123",
                    "title": "Atomic Habits",
                    "creator": "James Clear",
                    "isbn": "9780735211292",
                    "genre": "Self-Help",
                    "cover_image_url": "https://books.google.com/cover.jpg",
                }
            }
        ],
    )
    db_session.add_all([asset2, job2, cand2])
    db_session.commit()

    # User approves second candidate
    req2 = ReviewAcceptRequest(title="Atomic Habits", creator="James Clear")
    resp2 = accept_candidate(cand2.id, req2, current_user=auth_user, db=db_session)

    # Must link to the SAME item without creating a duplicate library_items row!
    assert resp2.id == item1_id
    assert db_session.query(LibraryItem).filter(LibraryItem.user_id == user_id).count() == 1
    # Both screenshots are preserved as linked ItemSources
    assert db_session.query(ItemSource).filter(ItemSource.library_item_id == item1_id).count() == 2
