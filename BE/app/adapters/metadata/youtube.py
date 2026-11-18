import re
import urllib.parse
import logging
import httpx
from typing import List, Optional, Dict, Any
from app.adapters.metadata.base import BaseMetadataAdapter
from app.adapters.metadata.rate_limiter import TokenBucketRateLimiter
from app.schemas.metadata import NormalizedMetadataRecord, MetadataSearchQuery
from app.core.config import settings

logger = logging.getLogger(__name__)


class YouTubeAdapter(BaseMetadataAdapter):
    """
    Adapter for YouTube videos, shorts, podcasts, and video courses.
    Supports:
    1. Zero-key oEmbed extraction for direct video URLs (title, channel, thumbnail).
    2. Deep search link synthesis with canonical URL formatting.
    3. Optional YouTube Data API v3 search when YOUTUBE_API_KEY is configured.
    """

    OEMBED_URL = "https://www.youtube.com/oembed"
    API_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = None,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.YOUTUBE_API_KEY
        self.timeout = timeout or settings.METADATA_HTTP_TIMEOUT_SECONDS
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter(rate_per_second=10.0)
        self._client = client

    @property
    def provider_name(self) -> str:
        return "youtube"

    @staticmethod
    def extract_video_id(url: str) -> Optional[str]:
        """
        Extracts YouTube 11-char video ID from various YouTube URL formats.
        """
        if not url or ("youtube.com" not in url and "youtu.be" not in url):
            return None
        patterns = [
            r"(?:v=|\/embed\/|\/shorts\/)([0-9A-Za-z_-]{11})",
            r"youtu\.be\/([0-9A-Za-z_-]{11})",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None

    async def get_by_url(self, url: str) -> Optional[NormalizedMetadataRecord]:
        """
        Uses YouTube oEmbed endpoint (no API key required) to fetch authoritative title,
        channel author, and high-res thumbnail.
        """
        video_id = self.extract_video_id(url)
        canonical_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else url

        await self.rate_limiter.acquire()
        client = self._client or httpx.AsyncClient(timeout=self.timeout)
        should_close = self._client is None

        try:
            params = {"url": canonical_url, "format": "json"}
            resp = await client.get(self.OEMBED_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                ext_id = video_id or hashlib.sha256(url.encode()).hexdigest()[:16]
                return NormalizedMetadataRecord(
                    provider_name=self.provider_name,
                    external_id=ext_id,
                    content_type="youtube_video",
                    title=data.get("title") or "YouTube Video",
                    creator=data.get("author_name"),
                    cover_image_url=data.get("thumbnail_url"),
                    provider_url=canonical_url,
                    publisher="YouTube",
                    raw_payload=data,
                )
            return None
        except Exception as e:
            logger.debug(f"Could not resolve YouTube oEmbed for {url}: {e}")
            return None
        finally:
            if should_close:
                await client.aclose()

    async def search(self, query: MetadataSearchQuery) -> List[NormalizedMetadataRecord]:
        clean_title = query.title.strip()
        encoded = urllib.parse.quote_plus(f"{clean_title} {query.creator or ''}".strip())
        direct_search_url = f"https://www.youtube.com/results?search_query={encoded}"

        # If an API key is present, attempt Data API search
        if self.api_key:
            await self.rate_limiter.acquire()
            client = self._client or httpx.AsyncClient(timeout=self.timeout)
            should_close = self._client is None
            try:
                params = {
                    "part": "snippet",
                    "q": f"{clean_title} {query.creator or ''}".strip(),
                    "type": "video",
                    "maxResults": min(query.limit, 5),
                    "key": self.api_key,
                }
                resp = await client.get(self.API_SEARCH_URL, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("items", [])
                    records: List[NormalizedMetadataRecord] = []
                    for item in items:
                        snippet = item.get("snippet", {})
                        vid_id = item.get("id", {}).get("videoId")
                        if not vid_id:
                            continue
                        thumbs = snippet.get("thumbnails", {})
                        cover = thumbs.get("high", {}).get("url") or thumbs.get("default", {}).get("url")
                        records.append(
                            NormalizedMetadataRecord(
                                provider_name=self.provider_name,
                                external_id=vid_id,
                                content_type="youtube_video",
                                title=snippet.get("title", clean_title),
                                creator=snippet.get("channelTitle"),
                                overview=snippet.get("description"),
                                cover_image_url=cover,
                                release_date=snippet.get("publishedAt"),
                                provider_url=f"https://www.youtube.com/watch?v={vid_id}",
                                publisher="YouTube",
                                raw_payload=item,
                            )
                        )
                    if records:
                        return records
            except Exception as e:
                logger.error(f"Error querying YouTube Data API: {e}")
            finally:
                if should_close:
                    await client.aclose()

        # Fallback / Zero-key synthesis
        fallback_record = NormalizedMetadataRecord(
            provider_name=self.provider_name,
            external_id=f"yt_search_{abs(hash(clean_title)) % 10000000}",
            content_type="youtube_video",
            title=clean_title,
            creator=query.creator,
            provider_url=direct_search_url,
            publisher="YouTube",
            raw_payload={"synthetic": True, "search_url": direct_search_url},
        )
        return [fallback_record]

    async def get_by_external_id(
        self, external_id: str, content_type: Optional[str] = None
    ) -> Optional[NormalizedMetadataRecord]:
        if len(external_id) == 11:
            return await self.get_by_url(f"https://www.youtube.com/watch?v={external_id}")
        return None
