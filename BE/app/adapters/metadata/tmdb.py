import re
import logging
import httpx
from typing import List, Optional, Dict, Any
from app.adapters.metadata.base import BaseMetadataAdapter
from app.adapters.metadata.rate_limiter import TokenBucketRateLimiter
from app.schemas.metadata import NormalizedMetadataRecord, MetadataSearchQuery
from app.schemas.common import ContentType
from app.core.config import settings

logger = logging.getLogger(__name__)


class TMDBAdapter(BaseMetadataAdapter):
    """
    Adapter for The Movie Database (TMDB) API v3.
    Normalizes movie and TV show search results into NormalizedMetadataRecord.
    """

    BASE_URL = "https://api.themoviedb.org/3"
    IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = None,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.TMDB_API_KEY
        self.timeout = timeout or settings.METADATA_HTTP_TIMEOUT_SECONDS
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter(rate_per_second=35.0)
        self._client = client

    @property
    def provider_name(self) -> str:
        return "tmdb"

    def _normalize_item(self, item: Dict[str, Any], default_type: Optional[str] = None) -> Optional[NormalizedMetadataRecord]:
        media_type = item.get("media_type") or default_type or "movie"
        if media_type not in ("movie", "tv"):
            return None

        content_type: ContentType = "movie" if media_type == "movie" else "tv_show"
        title = item.get("title") if media_type == "movie" else item.get("name")
        if not title:
            return None

        original_title = item.get("original_title") if media_type == "movie" else item.get("original_name")
        release_date = item.get("release_date") if media_type == "movie" else item.get("first_air_date")

        release_year = None
        if release_date:
            m = re.match(r"^(\d{4})", release_date)
            if m:
                release_year = int(m.group(1))

        poster_path = item.get("poster_path")
        cover_url = f"{self.IMAGE_BASE_URL}{poster_path}" if poster_path else None
        overview = item.get("overview")
        vote_average = item.get("vote_average")
        language = item.get("original_language")
        external_id = str(item.get("id"))

        provider_url = f"https://www.themoviedb.org/{media_type}/{external_id}"

        return NormalizedMetadataRecord(
            provider_name=self.provider_name,
            external_id=external_id,
            content_type=content_type,
            title=title,
            original_title=original_title,
            release_year=release_year,
            release_date=release_date,
            overview=overview,
            cover_image_url=cover_url,
            language=language,
            user_rating=round(float(vote_average), 1) if vote_average is not None else None,
            provider_url=provider_url,
            raw_payload=item,
        )

    async def search(self, query: MetadataSearchQuery) -> List[NormalizedMetadataRecord]:
        if not self.api_key:
            logger.debug("TMDB_API_KEY not configured. Skipping TMDB API search.")
            return []

        await self.rate_limiter.acquire()
        endpoint = "/search/multi"
        params = {
            "api_key": self.api_key,
            "query": query.title.strip(),
            "include_adult": "false",
        }
        if query.release_year and query.content_type == "movie":
            params["year"] = str(query.release_year)

        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            resp = await client.get(f"{self.BASE_URL}{endpoint}", params=params)
            if resp.status_code != 200:
                logger.warning(f"TMDB API returned {resp.status_code}: {resp.text}")
                return []

            data = resp.json()
            results = data.get("results", [])
            records: List[NormalizedMetadataRecord] = []
            for item in results:
                normalized = self._normalize_item(item)
                if normalized:
                    records.append(normalized)
            return records[: query.limit]
        except Exception as e:
            logger.error(f"Error querying TMDB API: {e}")
            return []
        finally:
            if should_close:
                await client.aclose()

    async def get_by_external_id(
        self, external_id: str, content_type: Optional[str] = None
    ) -> Optional[NormalizedMetadataRecord]:
        if not self.api_key:
            return None

        await self.rate_limiter.acquire()
        media_type = "tv" if content_type == "tv_show" else "movie"
        url = f"{self.BASE_URL}/{media_type}/{external_id}"
        params = {"api_key": self.api_key}

        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return None
            data = resp.json()
            return self._normalize_item(data, default_type=media_type)
        except Exception as e:
            logger.error(f"Error fetching TMDB entity {external_id}: {e}")
            return None
        finally:
            if should_close:
                await client.aclose()
