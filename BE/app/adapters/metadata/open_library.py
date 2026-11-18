import logging
import httpx
from typing import List, Optional, Dict, Any
from app.adapters.metadata.base import BaseMetadataAdapter
from app.adapters.metadata.rate_limiter import TokenBucketRateLimiter
from app.schemas.metadata import NormalizedMetadataRecord, MetadataSearchQuery
from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenLibraryAdapter(BaseMetadataAdapter):
    """
    Adapter for Open Library Search API.
    Acts as a resilient secondary provider for books if Google Books fails or yields no matches.
    """

    BASE_URL = "https://openlibrary.org"

    def __init__(
        self,
        timeout: float = None,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.timeout = timeout or settings.METADATA_HTTP_TIMEOUT_SECONDS
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter(rate_per_second=1.0)
        self._client = client

    @property
    def provider_name(self) -> str:
        return "open_library"

    def _normalize_doc(self, doc: Dict[str, Any]) -> Optional[NormalizedMetadataRecord]:
        title = doc.get("title")
        if not title:
            return None

        # Key is typically '/works/OL12345W'
        raw_key = doc.get("key", "")
        external_id = raw_key.replace("/works/", "") if raw_key else title

        author_names = doc.get("author_name", [])
        creator = author_names[0] if author_names else None
        additional_creators = author_names[1:] if len(author_names) > 1 else []

        release_year = doc.get("first_publish_year")
        isbns = doc.get("isbn", [])
        isbn = isbns[0] if isbns else None

        cover_i = doc.get("cover_i")
        cover_url = f"https://covers.openlibrary.org/b/id/{cover_i}-L.jpg" if cover_i else None

        publishers = doc.get("publisher", [])
        publisher = publishers[0] if publishers else None

        languages = doc.get("language", [])
        language = languages[0] if languages else None

        subjects = doc.get("subject", [])
        genre = subjects[0] if subjects else None

        user_rating = doc.get("ratings_average")
        if user_rating is not None:
            user_rating = round(float(user_rating) * 2, 1)  # Scale 5-star to 10-point

        return NormalizedMetadataRecord(
            provider_name=self.provider_name,
            external_id=external_id,
            content_type="book",
            title=title,
            creator=creator,
            additional_creators=additional_creators,
            release_year=release_year,
            cover_image_url=cover_url,
            isbn=isbn,
            genre=genre,
            publisher=publisher,
            language=language,
            user_rating=user_rating,
            provider_url=f"https://openlibrary.org{raw_key}" if raw_key else None,
            raw_payload=doc,
        )

    async def search(self, query: MetadataSearchQuery) -> List[NormalizedMetadataRecord]:
        await self.rate_limiter.acquire()
        url = f"{self.BASE_URL}/search.json"
        params = {"title": query.title.strip(), "limit": min(query.limit, 10)}
        if query.creator:
            params["author"] = query.creator.strip()
        if query.isbn:
            params["isbn"] = query.isbn.strip()

        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                logger.warning(f"Open Library API returned {resp.status_code}")
                return []

            data = resp.json()
            docs = data.get("docs", [])
            records: List[NormalizedMetadataRecord] = []
            for doc in docs:
                normalized = self._normalize_doc(doc)
                if normalized:
                    records.append(normalized)
            return records
        except Exception as e:
            logger.error(f"Error querying Open Library API: {e}")
            return []
        finally:
            if should_close:
                await client.aclose()

    async def get_by_external_id(
        self, external_id: str, content_type: Optional[str] = None
    ) -> Optional[NormalizedMetadataRecord]:
        await self.rate_limiter.acquire()
        clean_id = external_id.replace("/works/", "")
        url = f"{self.BASE_URL}/works/{clean_id}.json"

        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            data = resp.json()
            title = data.get("title")
            if not title:
                return None

            covers = data.get("covers", [])
            cover_url = f"https://covers.openlibrary.org/b/id/{covers[0]}-L.jpg" if covers else None

            description = data.get("description")
            if isinstance(description, dict):
                description = description.get("value")

            return NormalizedMetadataRecord(
                provider_name=self.provider_name,
                external_id=clean_id,
                content_type="book",
                title=title,
                overview=description,
                cover_image_url=cover_url,
                provider_url=f"https://openlibrary.org/works/{clean_id}",
                raw_payload=data,
            )
        except Exception as e:
            logger.error(f"Error fetching Open Library work {external_id}: {e}")
            return None
        finally:
            if should_close:
                await client.aclose()
