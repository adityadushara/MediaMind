import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from app.db.session import Base
from app.models.entities import LibraryItem, IdentificationCandidate
from app.schemas.metadata import (
    NormalizedMetadataRecord,
    MetadataSearchQuery,
    MatchFeatureScores,
    ProviderCandidateMatch,
)
from app.schemas.common import (
    LibraryItemCreate,
    LibraryItemResponse,
    IdentificationCandidateResponse,
)


@pytest.fixture
def memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_normalized_metadata_record_validation():
    record = NormalizedMetadataRecord(
        provider_name="google_books",
        external_id="vol_12345",
        content_type="book",
        title="Designing Data-Intensive Applications",
        original_title="Designing Data-Intensive Applications",
        creator="Martin Kleppmann",
        release_year=2017,
        release_date="2017-03-16",
        overview="The definitive guide to data systems architecture.",
        cover_image_url="https://books.google.com/covers/vol_12345.jpg",
        isbn="9781449373320",
        genre="Technology",
        publisher="O'Reilly Media",
        language="en",
        provider_url="https://books.google.com/books?id=vol_12345",
    )
    assert record.title == "Designing Data-Intensive Applications"
    assert record.isbn == "9781449373320"
    assert record.content_type == "book"
    assert record.provider_name == "google_books"


def test_metadata_search_query_validation():
    query = MetadataSearchQuery(
        title="Atomic Habits",
        creator="James Clear",
        content_type="book",
        release_year=2018,
    )
    assert query.title == "Atomic Habits"
    assert query.limit == 5


def test_library_item_extended_fields_persistence(memory_db):
    item = LibraryItem(
        user_id="user_test_123",
        title="Designing Data-Intensive Applications",
        creator="Martin Kleppmann",
        content_type="book",
        original_title="Designing Data-Intensive Applications",
        isbn="9781449373320",
        genre="Computers & Technology",
        runtime_minutes=None,
        language="en",
        publisher="O'Reilly Media",
        total_seasons=None,
        total_episodes=None,
        external_provider="google_books",
        external_id="vol_12345",
    )
    memory_db.add(item)
    memory_db.commit()
    memory_db.refresh(item)

    assert item.id is not None
    assert item.isbn == "9781449373320"
    assert item.genre == "Computers & Technology"
    assert item.publisher == "O'Reilly Media"
    assert item.language == "en"
    assert item.external_provider == "google_books"


def test_library_item_deduplication_unique_constraint(memory_db):
    item1 = LibraryItem(
        user_id="user_test_123",
        title="Inception",
        content_type="movie",
        external_provider="tmdb",
        external_id="movie_27205",
    )
    memory_db.add(item1)
    memory_db.commit()

    # Different user can have the same external_provider and external_id
    item_diff_user = LibraryItem(
        user_id="user_test_456",
        title="Inception",
        content_type="movie",
        external_provider="tmdb",
        external_id="movie_27205",
    )
    memory_db.add(item_diff_user)
    memory_db.commit()

    # Same user with same external_provider and external_id must fail unique constraint
    item_duplicate = LibraryItem(
        user_id="user_test_123",
        title="Inception Duplicate",
        content_type="movie",
        external_provider="tmdb",
        external_id="movie_27205",
    )
    memory_db.add(item_duplicate)
    with pytest.raises(IntegrityError):
        memory_db.commit()
    memory_db.rollback()


def test_library_item_pydantic_schema_serialization():
    payload = {
        "title": "Clean Code",
        "creator": "Robert C. Martin",
        "content_type": "book",
        "original_title": "Clean Code",
        "isbn": "9780132350884",
        "genre": "Programming",
        "language": "en",
        "publisher": "Prentice Hall",
        "external_provider": "google_books",
        "external_id": "clean_code_id",
    }
    schema = LibraryItemCreate(**payload)
    assert schema.isbn == "9780132350884"
    assert schema.genre == "Programming"
    assert schema.publisher == "Prentice Hall"


def test_candidate_provider_candidates_serialization():
    candidate_dict = {
        "id": "cand_1",
        "job_id": "job_1",
        "source_asset_id": "asset_1",
        "user_id": "user_1",
        "suggested_title": "Atomic Habits",
        "additional_creators": [],
        "visible_text": ["Atomic Habits"],
        "identifying_clues": [],
        "uncertainty_reasons": [],
        "provider_candidates": [
            {
                "provider_name": "google_books",
                "external_id": "xyz",
                "title": "Atomic Habits",
                "creator": "James Clear",
            }
        ],
        "review_status": "needs_review",
        "resolution_status": "pending",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    resp = IdentificationCandidateResponse(**candidate_dict)
    assert len(resp.provider_candidates) == 1
    assert resp.provider_candidates[0]["provider_name"] == "google_books"
