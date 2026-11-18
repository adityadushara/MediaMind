from abc import ABC, abstractmethod
from typing import List, Optional
from app.schemas.metadata import NormalizedMetadataRecord, MetadataSearchQuery


class BaseMetadataAdapter(ABC):
    """
    Abstract interface for external metadata providers.
    Every provider must normalize external vendor JSON payloads into NormalizedMetadataRecord.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique provider identifier (e.g. 'google_books', 'open_library', 'tmdb', 'youtube')."""
        pass

    @abstractmethod
    async def search(self, query: MetadataSearchQuery) -> List[NormalizedMetadataRecord]:
        """
        Executes targeted external search and returns normalized records.
        """
        pass

    @abstractmethod
    async def get_by_external_id(
        self, external_id: str, content_type: Optional[str] = None
    ) -> Optional[NormalizedMetadataRecord]:
        """
        Fetches full authoritative record by provider's unique external identifier.
        """
        pass
