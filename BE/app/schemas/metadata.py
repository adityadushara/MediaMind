from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from app.schemas.common import ContentType


class MetadataSearchQuery(BaseModel):
    title: str = Field(..., min_length=1)
    creator: Optional[str] = None
    content_type: Optional[ContentType] = None
    release_year: Optional[int] = None
    isbn: Optional[str] = None
    limit: int = Field(default=5, ge=1, le=20)


class MatchFeatureScores(BaseModel):
    title_score: float = 0.0
    creator_score: float = 0.0
    type_score: float = 0.0
    year_score: float = 0.0
    clues_score: float = 0.0
    composite_score: float = 0.0
    explanation_pills: List[str] = Field(default_factory=list)


class NormalizedMetadataRecord(BaseModel):
    provider_name: str                        # 'google_books', 'tmdb', 'open_library', 'youtube'
    external_id: str                          # e.g. 'volume_id', 'tmdb_movie_id'
    content_type: ContentType                 # 'book', 'movie', 'tv_show', 'youtube_video', etc.
    title: str                                # Canonical title
    original_title: Optional[str] = None      # Original language title
    creator: Optional[str] = None             # Primary author, director, channel
    additional_creators: List[str] = Field(default_factory=list)  # Co-authors, cast, showrunners
    release_year: Optional[int] = None
    release_date: Optional[str] = None        # YYYY-MM-DD
    overview: Optional[str] = None            # Synopsis / plot description
    cover_image_url: Optional[str] = None     # HTTPS URL from provider CDN
    isbn: Optional[str] = None                # ISBN-10 or ISBN-13 (books)
    genre: Optional[str] = None               # Primary genre (Sci-Fi, Tech, Drama)
    runtime_minutes: Optional[int] = None     # Duration in minutes
    total_seasons: Optional[int] = None       # TV shows
    total_episodes: Optional[int] = None      # TV shows
    publisher: Optional[str] = None           # Book publisher or network/channel
    language: Optional[str] = None            # ISO 639-1 ('en', 'ja', 'fr')
    user_rating: Optional[float] = None       # External rating (0.0 - 10.0)
    provider_url: Optional[str] = None        # Canonical web page or deep link on provider
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class ProviderCandidateMatch(BaseModel):
    record: NormalizedMetadataRecord
    scores: MatchFeatureScores
    is_top_match: bool = False
