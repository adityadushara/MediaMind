from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user, AuthenticatedUser
from app.db.session import get_db
from app.schemas.rag import RAGQueryRequest, RAGQueryResponse
from app.services.rag_service import RAGService

router = APIRouter(prefix="/rag", tags=["RAG & Semantic Search"])


@router.post("/ask", response_model=RAGQueryResponse)
async def ask_library(
    request: RAGQueryRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    'Ask Your Library': Natural language semantic question answering over personal media records.
    Enforces user isolation, grounds answers strictly in personal library records, and links
    relevant items with sub-5-second execution SLA.
    """
    service = RAGService()
    return await service.ask(db, current_user.id, request)
