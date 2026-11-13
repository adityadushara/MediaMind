from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


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
    created_at: datetime


class AssetUploadResponse(BaseModel):
    asset_id: str
    file_name: str
    sha256_hash: str
    file_size_bytes: int
    mime_type: str
    job_id: str
    status: str


class BatchUploadResponse(BaseModel):
    assets: List[AssetUploadResponse]
    total_count: int


# Processing Job
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
    created_at: datetime
    updated_at: datetime


# Library Item
ContentType = Literal["book", "movie", "tv_show", "youtube_video", "documentary", "podcast", "course"]
ConsumptionStatus = Literal["want_to_consume", "consuming", "completed", "on_hold", "dropped"]
VerificationStatus = Literal["verified", "manual_entry", "auto_accepted"]


class LibraryItemBase(BaseModel):
    title: str = Field(..., min_length=1)
    creator: Optional[str] = None
    content_type: ContentType
    consumption_status: ConsumptionStatus = "want_to_consume"
    release_year: Optional[int] = None
    overview: Optional[str] = None
    cover_image_url: Optional[str] = None
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
    consumption_status: Optional[ConsumptionStatus] = None
    release_year: Optional[int] = None
    overview: Optional[str] = None
    cover_image_url: Optional[str] = None
    user_rating: Optional[float] = Field(None, ge=0.0, le=10.0)
    provider_metadata: Optional[Dict[str, Any]] = None


class LibraryItemResponse(LibraryItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    verification_status: str
    created_at: datetime
    updated_at: datetime


class LibraryItemListResponse(BaseModel):
    total: int
    items: List[LibraryItemResponse]


# Identification Candidate
class IdentificationCandidateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    source_asset_id: str
    suggested_title: str
    suggested_creator: Optional[str] = None
    suggested_type: Optional[str] = None
    confidence_score: Optional[float] = None
    evidence_text: Optional[str] = None
    bounding_box: Optional[Dict[str, Any]] = None
    provider_candidates: List[Dict[str, Any]] = Field(default_factory=list)
    resolution_status: str
    resolved_library_item_id: Optional[str] = None
    created_at: datetime
