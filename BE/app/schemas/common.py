from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator


# Health Check
class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    database: str
    storage: str


# Auth User
class UserProfileResponse(BaseModel):
    id: str
    email: Optional[str] = None
    role: str
    display_name: Optional[str] = None


# Source Asset
class SourceAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_name: str
    file_path: str
    file_size_bytes: int
    mime_type: str
    sha256_hash: str
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    idempotency_key: Optional[str] = None
    signed_url: Optional[str] = None
    latest_status: Optional[str] = None
    created_at: datetime


class SourceAssetListResponse(BaseModel):
    total: int
    items: List[SourceAssetResponse]


class AssetUploadResponse(BaseModel):
    asset_id: str
    file_name: str
    sha256_hash: str
    file_size_bytes: int
    mime_type: str
    job_id: str
    status: str
    is_duplicate: bool = False
    library_item_id: Optional[str] = None


class BatchUploadResponse(BaseModel):
    assets: List[AssetUploadResponse]
    total_count: int


# Processing Job
JobStatus = Literal[
    "queued",
    "processing",
    "awaiting_identification",
    "completed",
    "identified",
    "needs_review",
    "unidentified",
    "failed"
]


class JobCandidateSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    suggested_title: str
    suggested_creator: Optional[str] = None
    suggested_type: Optional[str] = None
    suggested_subcategory: Optional[str] = None
    direct_url: Optional[str] = None
    confidence_score: Optional[float] = None
    review_status: Optional[str] = None
    derivative_id: Optional[str] = None
    crop_signed_url: Optional[str] = None


class ProcessingJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_asset_id: str
    status: str
    retry_count: int
    max_retries: int
    error_message: Optional[str] = None
    ai_model_name: Optional[str] = None
    prompt_version: Optional[str] = None
    processing_time_ms: Optional[int] = None
    token_usage: Optional[Dict[str, Any]] = None
    claimed_at: Optional[datetime] = None
    claimed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    candidates: List[JobCandidateSummary] = Field(default_factory=list)


class JobClaimResponse(BaseModel):
    claimed: bool
    job: Optional[ProcessingJobResponse] = None


class StaleJobRecoveryResponse(BaseModel):
    recovered_count: int
    failed_count: int


# Library Item
ContentType = Literal[
    "book",
    "movie",
    "tv_show",
    "youtube_video",
    "documentary",
    "podcast",
    "course",
    "article",
    "newsletter",
    "other"
]
ConsumptionStatus = Literal["want_to_consume", "consuming", "completed", "on_hold", "dropped"]
VerificationStatus = Literal["verified", "manual_entry", "auto_accepted"]


class LibraryItemBase(BaseModel):
    title: str = Field(..., min_length=1)
    creator: Optional[str] = None
    content_type: ContentType
    subcategory: Optional[str] = None
    direct_url: Optional[str] = None
    consumption_status: ConsumptionStatus = "want_to_consume"
    release_year: Optional[int] = None
    overview: Optional[str] = None
    cover_image_url: Optional[str] = None
    original_title: Optional[str] = None
    isbn: Optional[str] = None
    genre: Optional[str] = None
    runtime_minutes: Optional[int] = None
    language: Optional[str] = None
    publisher: Optional[str] = None
    total_seasons: Optional[int] = None
    total_episodes: Optional[int] = None
    last_synced_at: Optional[datetime] = None
    external_provider: Optional[str] = None
    external_id: Optional[str] = None
    provider_metadata: Dict[str, Any] = Field(default_factory=dict)
    user_rating: Optional[float] = Field(None, ge=0.0, le=10.0)


class LibraryItemCreate(LibraryItemBase):
    source_asset_id: Optional[str] = None


class LibraryItemUpdate(BaseModel):
    title: Optional[str] = None
    creator: Optional[str] = None
    content_type: Optional[ContentType] = None
    subcategory: Optional[str] = None
    direct_url: Optional[str] = None
    consumption_status: Optional[ConsumptionStatus] = None
    release_year: Optional[int] = None
    overview: Optional[str] = None
    cover_image_url: Optional[str] = None
    original_title: Optional[str] = None
    isbn: Optional[str] = None
    genre: Optional[str] = None
    runtime_minutes: Optional[int] = None
    language: Optional[str] = None
    publisher: Optional[str] = None
    total_seasons: Optional[int] = None
    total_episodes: Optional[int] = None
    user_rating: Optional[float] = Field(None, ge=0.0, le=10.0)
    verification_status: Optional[str] = None
    provider_metadata: Optional[Dict[str, Any]] = None


class LibraryItemResponse(LibraryItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    verification_status: str
    screenshot_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LinkedSourceAsset(BaseModel):
    id: str
    file_name: str
    file_path: str
    file_size_bytes: int
    mime_type: str
    sha256_hash: str
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    signed_url: Optional[str] = None
    crop_coordinates: Optional[Dict[str, Any]] = None
    created_at: datetime


class LibraryItemDetailResponse(LibraryItemResponse):
    sources: List[LinkedSourceAsset] = Field(default_factory=list)


class LibraryItemListResponse(BaseModel):
    total: int
    items: List[LibraryItemResponse]


class AssociateSourcePayload(BaseModel):
    source_asset_id: str
    crop_coordinates: Optional[Dict[str, Any]] = None
    detection_confidence: Optional[float] = None


class LinkedLibraryItem(BaseModel):
    id: str
    title: str
    creator: Optional[str] = None
    content_type: str
    consumption_status: str
    created_at: datetime


class SourceAssetDetailResponse(SourceAssetResponse):
    latest_job: Optional[ProcessingJobResponse] = None
    library_items: List[LinkedLibraryItem] = Field(default_factory=list)


# Identification Candidate
class BoundingBox(BaseModel):
    x_min: int = Field(..., ge=0, le=1000, description="Normalized X min (0-1000)")
    y_min: int = Field(..., ge=0, le=1000, description="Normalized Y min (0-1000)")
    x_max: int = Field(..., ge=0, le=1000, description="Normalized X max (0-1000)")
    y_max: int = Field(..., ge=0, le=1000, description="Normalized Y max (0-1000)")

    @model_validator(mode="after")
    def validate_bounds(self) -> "BoundingBox":
        if self.x_min >= self.x_max:
            raise ValueError("x_min must be strictly less than x_max")
        if self.y_min >= self.y_max:
            raise ValueError("y_min must be strictly less than y_max")
        return self


class GeminiCandidateOutput(BaseModel):
    content_type: ContentType = Field(default="other", description="Detected media type")
    subcategory: Optional[str] = Field(None, description="Topic or genre subcategory (e.g. Psychology, Habits, Money, Sci-Fi, Business, Tech, Tutorials, Philosophy)")
    direct_url: Optional[str] = Field(None, description="Direct URL if visible in the screenshot or canonical web link")
    title: str = Field(..., min_length=1, max_length=500, description="Extracted title")
    creator: Optional[str] = Field(None, max_length=500, description="Author, director, channel, or creator")
    additional_creators: List[str] = Field(default_factory=list, description="Other contributors")
    description_clue: Optional[str] = Field(None, description="Short summary clue visible on image")
    year_clue: Optional[int] = Field(None, ge=1800, le=2100, description="Release year clue")
    visible_text: List[str] = Field(default_factory=list, description="Verbatim visible text on image")
    identifying_clues: List[str] = Field(default_factory=list, description="Visual clues like logos, badges")
    bounding_box: Optional[BoundingBox] = Field(None, description="Normalized 0-1000 box around item")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Model-reported confidence")
    evidence: List[str] = Field(default_factory=list, description="Visual reasoning and textual evidence")
    uncertainty_reasons: List[str] = Field(default_factory=list, description="Why this candidate may be uncertain")


class GeminiExtractionResponse(BaseModel):
    candidates: List[GeminiCandidateOutput] = Field(default_factory=list)
    detected_regions_count: int = Field(default=0)
    raw_analysis: Optional[str] = Field(None)


class IdentificationCandidateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    source_asset_id: str
    user_id: str
    run_id: Optional[str] = None
    derivative_id: Optional[str] = None
    suggested_title: str
    suggested_creator: Optional[str] = None
    additional_creators: List[str] = Field(default_factory=list)
    suggested_type: Optional[str] = None
    suggested_subcategory: Optional[str] = None
    direct_url: Optional[str] = None
    description_clue: Optional[str] = None
    year_clue: Optional[int] = None
    visible_text: List[str] = Field(default_factory=list)
    identifying_clues: List[str] = Field(default_factory=list)
    uncertainty_reasons: List[str] = Field(default_factory=list)
    confidence_score: Optional[float] = None
    evidence_text: Optional[str] = None
    bounding_box: Optional[Dict[str, Any]] = None
    provider_candidates: List[Dict[str, Any]] = Field(default_factory=list)
    review_status: str
    resolution_status: str
    resolved_library_item_id: Optional[str] = None
    prompt_version: Optional[str] = None
    ai_model_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IdentificationCandidateDetailResponse(IdentificationCandidateResponse):
    source_signed_url: Optional[str] = None
    crop_signed_url: Optional[str] = None


class CandidateListResponse(BaseModel):
    total: int
    items: List[IdentificationCandidateDetailResponse]


class CandidateUpdateRequest(BaseModel):
    suggested_title: Optional[str] = Field(None, min_length=1)
    suggested_creator: Optional[str] = None
    suggested_type: Optional[ContentType] = None
    suggested_subcategory: Optional[str] = None
    direct_url: Optional[str] = None
    description_clue: Optional[str] = None
    year_clue: Optional[int] = None


class ReviewAcceptRequest(BaseModel):
    title: Optional[str] = None
    creator: Optional[str] = None
    content_type: Optional[ContentType] = None
    subcategory: Optional[str] = None
    direct_url: Optional[str] = None
    consumption_status: Optional[ConsumptionStatus] = "want_to_consume"
    overview: Optional[str] = None
    release_year: Optional[int] = None
    user_rating: Optional[float] = Field(None, ge=0.0, le=10.0)
    cover_image_url: Optional[str] = None
    external_provider: Optional[str] = None
    external_id: Optional[str] = None
    isbn: Optional[str] = None
    genre: Optional[str] = None
    publisher: Optional[str] = None
    provider_metadata: Optional[Dict[str, Any]] = None


class ReviewCountsResponse(BaseModel):
    pending_review: int
    accepted: int
    rejected: int
    total: int


class ProcessingRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    source_asset_id: str
    prompt_version: str
    ai_model_name: str
    status: str
    processing_duration_ms: Optional[int] = None
    prompt_tokens: Optional[int] = None
    candidate_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    estimated_cost_usd: Optional[float] = None
    region_count: int
    candidate_count: int
    error_category: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
