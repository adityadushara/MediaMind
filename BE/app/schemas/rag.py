from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from app.schemas.common import LibraryItemResponse


class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="Natural language question about your library")
    top_k: int = Field(default=5, ge=1, le=20, description="Maximum number of context items to retrieve")


class RAGQueryResponse(BaseModel):
    query: str
    answer: str
    matched_items: List[LibraryItemResponse] = Field(default_factory=list)
    duration_ms: int
    model_name: str
