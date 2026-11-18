import re
import logging
import httpx
from typing import List, Optional, Dict, Any
from app.adapters.metadata.base import BaseMetadataAdapter
from app.adapters.metadata.rate_limiter import TokenBucketRateLimiter
from app.schemas.metadata import NormalizedMetadataRecord, MetadataSearchQuery
from app.core.config import settings

logger = logging.getLogger(__name__)


class GoogleBooksAdapter(BaseMetadataAdapter):
    """
    Adapter for Google Books Volumes API.
    Normalizes Google Books volume items into NormalizedMetadataRecord.
    """

    BASE_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = None,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.GOOGLE_BOOKS_API_KEY
        self.timeout = timeout or settings.METADATA_HTTP_TIMEOUT_SECONDS
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter(rate_per_second=15.0)
        self._client = client

    @property
    def provider_name(self) -> str:
        return "google_books"

    def _build_search_query(self, query: MetadataSearchQuery) -> str:
        parts = []
        clean_title = re.sub(r'["\':]', " ", query.title).strip()
        if clean_title:
            parts.append(f"intitle:{clean_title}")

        if query.creator:
            clean_creator = re.sub(r'["\':]', " ", query.creator).strip()
            if clean_creator:
                parts.append(f"inauthor:{clean_creator}")

        if query.isbn:
            clean_isbn = query.isbn.replace("-", "").strip()
            if clean_isbn:
                parts.append(f"isbn:{clean_isbn}")

        return "+".join(parts) if parts else query.title.strip()

    def _normalize_item(self, item: Dict[str, Any]) -> Optional[NormalizedMetadataRecord]:
        volume_info = item.get("volumeInfo", {})
        title = volume_info.get("title")
        if not title:
            return None

        volume_id = item.get("id", "")
        authors = volume_info.get("authors", [])
        creator = authors[0] if authors else None
        additional_creators = authors[1:] if len(authors) > 1 else []

        # Parse release year & date
        published_date = volume_info.get("publishedDate")
        release_year = None
        if published_date:
            year_match = re.match(r"^(\d{4})", published_date)
            if year_match:
                release_year = int(year_match.group(1))

        # Parse ISBN
        isbn = None
        identifiers = volume_info.get("industryIdentifiers", [])
        for ident in identifiers:
            t = ident.get("type", "")
            val = ident.get("identifier", "")
            if t == "ISBN_13":
                isbn = val
                break
            elif t == "ISBN_10" and not isbn:
                isbn = val

        # Parse cover image (force HTTPS)
        image_links = volume_info.get("imageLinks", {})
        cover_url = image_links.get("thumbnail") or image_links.get("smallThumbnail")
        if cover_url:
            cover_url = cover_url.replace("http://", "https://")

        categories = volume_info.get("categories", [])
        genre = categories[0] if categories else None

        return NormalizedMetadataRecord(
            provider_name=self.provider_name,
            external_id=volume_id,
            content_type="book",
            title=title,
            original_title=volume_info.get("subtitle"),
            creator=creator,
            additional_creators=additional_creators,
            release_year=release_year,
            release_date=published_date,
            overview=volume_info.get("description"),
            cover_image_url=cover_url,
            isbn=isbn,
            genre=genre,
            publisher=volume_info.get("publisher"),
            language=volume_info.get("language"),
            user_rating=volume_info.get("averageRating"),
            provider_url=volume_info.get("infoLink") or f"https://books.google.com/books?id={volume_id}",
            raw_payload=item,
        )

    async def search(self, query: MetadataSearchQuery) -> List[NormalizedMetadataRecord]:
        await self.rate_limiter.acquire()
        q_str = self._build_search_query(query)
        params = {
            "q": q_str,
            "maxResults": min(query.limit, 20),
            "printType": "books",
        }
        if self.api_key:
            params["key"] = self.api_key

        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            resp = await client.get(self.BASE_URL, params=params)
            if resp.status_code != 200:
                logger.warning(f"Google Books API returned {resp.status_code}: {resp.text}")
                return []

            data = resp.json()
            items = data.get("items", [])
            records: List[NormalizedMetadataRecord] = []
            for item in items:
                normalized = self._normalize_item(item)
                if normalized:
                    records.append(normalized)
            return records
        except Exception as e:
            logger.error(f"Error querying Google Books API: {e}")
            return []
        finally:
            if should_close:
                await client.aclose()

    async def get_by_external_id(
        self, external_id: str, content_type: Optional[str] = None
    ) -> Optional[NormalizedMetadataRecord]:
        await self.rate_limiter.acquire()
        url = f"{self.BASE_URL}/{external_id}"
        params = {}
        if self.api_key:
            params["key"] = self.api_key

        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 404:
                return None
            if resp.status_code != 200:
                logger.warning(f"Google Books API returned {resp.status_code} for id {external_id}")
                return None

            data = resp.json()
            return self._normalize_item(data)
        except Exception as e:
            logger.error(f"Error fetching Google Books volume {external_id}: {e}")
            return None
        finally:
            if should_close:
                await client.aclose()
