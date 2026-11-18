import time
import logging
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.entities import LibraryItem, ItemNote
from app.schemas.rag import RAGQueryRequest, RAGQueryResponse
from app.schemas.common import LibraryItemResponse
from app.core.config import settings
from app.services.entity_resolution import normalize_title, token_sort_similarity

logger = logging.getLogger(__name__)


class RAGService:
    """
    Enterprise RAG & Semantic Retrieval Service for MediaMind.
    Enforces user tenant isolation and grounds natural language Q&A in personal library records.
    Designed for sub-5-second end-to-end response times.
    """

    def __init__(self, gemini_api_key: Optional[str] = None):
        self.api_key = gemini_api_key if gemini_api_key is not None else settings.GEMINI_API_KEY
        self.model_name = settings.GEMINI_RUNTIME_MODEL

    def _retrieve_relevant_items(
        self, db: Session, user_id: str, query: str, top_k: int = 5
    ) -> List[LibraryItem]:
        """
        Fast hybrid candidate retrieval: combines database filtering with fuzzy relevance scoring.
        """
        # 1. Fetch user's library items (strictly tenant-isolated)
        items = (
            db.query(LibraryItem)
            .filter(LibraryItem.user_id == user_id)
            .order_by(LibraryItem.created_at.desc())
            .limit(100)
            .all()
        )

        if not items:
            return []

        clean_query = normalize_title(query)
        query_tokens = set(clean_query.split())

        scored_items: List[Tuple[float, LibraryItem]] = []

        for item in items:
            # Build search text corpus
            corpus = f"{item.title} {item.creator or ''} {item.subcategory or ''} {item.genre or ''} {item.overview or ''} {item.content_type}".lower()
            clean_corpus = normalize_title(corpus)
            corpus_tokens = set(clean_corpus.split())

            score = 0.0

            # Exact phrase match in corpus
            if clean_query in clean_corpus:
                score += 0.6

            # Token overlap
            if query_tokens and corpus_tokens:
                overlap = len(query_tokens & corpus_tokens) / len(query_tokens)
                score += overlap * 0.4

            # Fuzzy title similarity
            title_sim = token_sort_similarity(query, item.title)
            score += title_sim * 0.3

            # Category / type match
            if item.content_type.lower() in clean_query:
                score += 0.2
            if item.subcategory and item.subcategory.lower() in clean_query:
                score += 0.25

            if score > 0.15:
                scored_items.append((score, item))

        # Sort by relevance descending
        scored_items.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored_items[:top_k]]

    async def ask(
        self, db: Session, user_id: str, request: RAGQueryRequest
    ) -> RAGQueryResponse:
        start_time = time.monotonic()

        # 1. Retrieve relevant items
        matched_items = self._retrieve_relevant_items(
            db, user_id, request.query, top_k=request.top_k
        )

        if not matched_items:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            return RAGQueryResponse(
                query=request.query,
                answer=(
                    f"I couldn't find any records in your personal library matching **'{request.query}'**.\n\n"
                    "You can try asking by:\n"
                    "• **Topic / Subcategory** (e.g. *'Show me my psychology books'* or *'Any tech podcasts?'*)\n"
                    "• **Creator / Author** (e.g. *'What did I save by James Clear?'*)\n"
                    "• **Media Type** (e.g. *'What YouTube videos have I saved?'*)"
                ),
                matched_items=[],
                duration_ms=duration_ms,
                model_name=self.model_name,
            )

        # 2. Build context for Gemini
        context_lines = []
        for idx, item in enumerate(matched_items, start=1):
            line = (
                f"{idx}. Title: {item.title}\n"
                f"   Creator: {item.creator or 'Unknown'}\n"
                f"   Type: {item.content_type}\n"
                f"   Subcategory: {item.subcategory or 'General'}\n"
                f"   Direct Link: {item.direct_url or 'N/A'}\n"
            )
            if item.overview:
                line += f"   Overview: {item.overview[:200]}...\n"
            context_lines.append(line)

        context_text = "\n".join(context_lines)

        prompt = (
            "You are MediaMind's AI Library Assistant. A user is asking a question about their personal saved media library.\n"
            "Answer the question helpfully and concisely using ONLY the provided verified library items below.\n"
            "Mention the exact titles, creators, and why they answer the user's question.\n"
            "Include markdown links to their direct URLs when mentioning them.\n\n"
            f"=== USER'S VERIFIED LIBRARY ITEMS ===\n{context_text}\n\n"
            f"User Question: {request.query}\n\n"
            "Assistant Answer:"
        )

        # 3. Generate answer via Gemini (fast inference)
        answer = None
        if self.api_key and self.api_key.strip():
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=self.api_key)
                response = client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=500,
                    ),
                )
                if response and response.text:
                    answer = response.text.strip()
            except Exception as e:
                logger.warning(f"Gemini RAG call failed ({e}), using grounded template fallback")

        # Fallback synthesis if offline or API key missing
        if not answer:
            bullet_points = []
            for item in matched_items:
                link_md = f"[{item.title}]({item.direct_url})" if item.direct_url else f"**{item.title}**"
                creator_str = f" by *{item.creator}*" if item.creator else ""
                bullet_points.append(f"• {link_md}{creator_str} (`{item.content_type}` · {item.subcategory or 'General'})")

            items_list = "\n".join(bullet_points)
            answer = (
                f"Based on your library, here are the most relevant items for **'{request.query}'**:\n\n"
                f"{items_list}\n\n"
                "You can click on any title to open the direct link immediately."
            )

        duration_ms = int((time.monotonic() - start_time) * 1000)

        serialized_items = [LibraryItemResponse.model_validate(it) for it in matched_items]

        return RAGQueryResponse(
            query=request.query,
            answer=answer,
            matched_items=serialized_items,
            duration_ms=duration_ms,
            model_name=self.model_name,
        )
