import asyncio
import logging
from typing import List, Optional, Dict
from app.schemas.metadata import NormalizedMetadataRecord, MetadataSearchQuery
from app.adapters.metadata.base import BaseMetadataAdapter
from app.adapters.metadata.google_books import GoogleBooksAdapter
from app.adapters.metadata.open_library import OpenLibraryAdapter
from app.adapters.metadata.tmdb import TMDBAdapter
from app.adapters.metadata.youtube import YouTubeAdapter

logger = logging.getLogger(__name__)


class MetadataProviderRouter:
    """
    Intelligent dispatch router for external metadata providers.
    Directs queries to appropriate adapters based on detected content type,
    with automatic fallbacks and multi-provider fan-out.
    """

    def __init__(
        self,
        google_books: Optional[GoogleBooksAdapter] = None,
        open_library: Optional[OpenLibraryAdapter] = None,
        tmdb: Optional[TMDBAdapter] = None,
        youtube: Optional[YouTubeAdapter] = None,
    ):
        self.google_books = google_books or GoogleBooksAdapter()
        self.open_library = open_library or OpenLibraryAdapter()
        self.tmdb = tmdb or TMDBAdapter()
        self.youtube = youtube or YouTubeAdapter()

        self._adapters: Dict[str, BaseMetadataAdapter] = {
            self.google_books.provider_name: self.google_books,
            self.open_library.provider_name: self.open_library,
            self.tmdb.provider_name: self.tmdb,
            self.youtube.provider_name: self.youtube,
        }

    def get_adapter(self, provider_name: str) -> Optional[BaseMetadataAdapter]:
        return self._adapters.get(provider_name)

    async def search(self, query: MetadataSearchQuery) -> List[NormalizedMetadataRecord]:
        """
        Executes category-aware metadata search with automatic fallbacks.
        """
        content_type = (query.content_type or "").lower()

        if content_type == "book":
            # 1. Primary: Google Books
            results = await self.google_books.search(query)
            if results:
                return results
            # 2. Secondary fallback: Open Library
            logger.info(f"Google Books yielded 0 results for '{query.title}', falling back to Open Library")
            return await self.open_library.search(query)

        elif content_type in ("movie", "tv_show", "documentary"):
            # Primary: TMDB
            results = await self.tmdb.search(query)
            if results:
                return results
            return []

        elif content_type in ("youtube_video", "podcast", "course"):
            # YouTube & Web Video adapter
            return await self.youtube.search(query)

        else:
            # Multi-provider fan-out for ambiguous / other content
            tasks = [
                self.google_books.search(query),
                self.tmdb.search(query),
            ]
            nested_results = await asyncio.gather(*tasks, return_exceptions=True)
            aggregated: List[NormalizedMetadataRecord] = []
            for res in nested_results:
                if isinstance(res, list):
                    aggregated.extend(res)
            return aggregated[: query.limit]

    async def get_by_provider_and_id(
        self, provider_name: str, external_id: str, content_type: Optional[str] = None
    ) -> Optional[NormalizedMetadataRecord]:
        """
        Fetches an authoritative record from a specific provider by ID.
        """
        adapter = self.get_adapter(provider_name)
        if not adapter:
            logger.warning(f"No adapter registered for provider: {provider_name}")
            return None
        return await adapter.get_by_external_id(external_id, content_type=content_type)
