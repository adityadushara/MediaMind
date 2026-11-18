import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models.entities import LibraryItem, Profile
from app.services.rag_service import RAGService
from app.schemas.rag import RAGQueryRequest
from app.core.security import AuthenticatedUser


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.mark.asyncio
async def test_rag_tenant_isolation(test_db):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    # User A item
    item_a = LibraryItem(
        id=str(uuid.uuid4()),
        user_id=user_a,
        title="Atomic Habits",
        creator="James Clear",
        content_type="book",
        subcategory="Habits",
        overview="Tiny changes, remarkable results.",
    )

    # User B item
    item_b = LibraryItem(
        id=str(uuid.uuid4()),
        user_id=user_b,
        title="Deep Work",
        creator="Cal Newport",
        content_type="book",
        subcategory="Productivity",
        overview="Rules for focused success in a distracted world.",
    )

    test_db.add_all([item_a, item_b])
    test_db.commit()

    service = RAGService(gemini_api_key="")

    # User A asks about Deep Work (only in User B's library)
    req_a = RAGQueryRequest(query="Deep Work Cal Newport")
    resp_a = await service.ask(test_db, user_a, req_a)

    # Must NOT retrieve User B's items!
    assert len(resp_a.matched_items) == 0
    assert "couldn't find any records in your personal library" in resp_a.answer

    # User A asks about Atomic Habits
    req_a_habits = RAGQueryRequest(query="habit building book")
    resp_a_habits = await service.ask(test_db, user_a, req_a_habits)

    assert len(resp_a_habits.matched_items) == 1
    assert resp_a_habits.matched_items[0].title == "Atomic Habits"
    assert "Atomic Habits" in resp_a_habits.answer


@pytest.mark.asyncio
async def test_rag_speed_sla(test_db):
    user_id = str(uuid.uuid4())
    item = LibraryItem(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title="Huberman Lab Podcast: Master Your Sleep",
        creator="Andrew Huberman",
        content_type="podcast",
        subcategory="Health & Science",
        direct_url="https://youtube.com/watch?v=sample",
    )
    test_db.add(item)
    test_db.commit()

    service = RAGService(gemini_api_key="")
    req = RAGQueryRequest(query="sleep podcast")
    resp = await service.ask(test_db, user_id, req)

    # Must respond well under 5000ms (SLA target is sub-5s)
    assert resp.duration_ms < 5000
    assert len(resp.matched_items) == 1
    assert "Huberman" in resp.matched_items[0].title
