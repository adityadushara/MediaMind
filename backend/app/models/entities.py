import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Text,
    BigInteger,
    Integer,
    Numeric,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.db.session import Base


def generate_uuid():
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String(36), primary_key=True)  # References auth.users(id)
    display_name = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    preferences = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class SourceAsset(Base):
    __tablename__ = "source_assets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    file_path = Column(Text, nullable=False)
    file_name = Column(Text, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    jobs = relationship("ProcessingJob", back_populates="source_asset", cascade="all, delete-orphan")
    candidates = relationship("IdentificationCandidate", back_populates="source_asset", cascade="all, delete-orphan")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    source_asset_id = Column(String(36), ForeignKey("source_assets.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="queued", nullable=False, index=True)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    error_message = Column(Text, nullable=True)
    ai_model_name = Column(String(100), nullable=True)
    prompt_version = Column(String(50), nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
    token_usage = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    source_asset = relationship("SourceAsset", back_populates="jobs")
    candidates = relationship("IdentificationCandidate", back_populates="job", cascade="all, delete-orphan")


class LibraryItem(Base):
    __tablename__ = "library_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    title = Column(Text, nullable=False, index=True)
    creator = Column(Text, nullable=True)
    content_type = Column(String(50), nullable=False, index=True)  # book, movie, etc.
    consumption_status = Column(String(50), default="want_to_consume", nullable=False, index=True)
    release_year = Column(Integer, nullable=True)
    overview = Column(Text, nullable=True)
    cover_image_url = Column(Text, nullable=True)
    external_provider = Column(String(50), nullable=True)
    external_id = Column(Text, nullable=True)
    provider_metadata = Column(JSON, default=dict, nullable=False)
    user_rating = Column(Numeric(3, 1), nullable=True)
    verification_status = Column(String(50), default="verified", nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    sources = relationship("ItemSource", back_populates="library_item", cascade="all, delete-orphan")
    progress = relationship("ItemProgress", back_populates="library_item", uselist=False, cascade="all, delete-orphan")
    notes = relationship("ItemNote", back_populates="library_item", cascade="all, delete-orphan")


class ItemSource(Base):
    __tablename__ = "item_sources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    library_item_id = Column(String(36), ForeignKey("library_items.id", ondelete="CASCADE"), nullable=False)
    source_asset_id = Column(String(36), ForeignKey("source_assets.id", ondelete="CASCADE"), nullable=False)
    crop_coordinates = Column(JSON, nullable=True)
    detection_confidence = Column(Numeric(4, 3), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("library_item_id", "source_asset_id", name="uq_item_source"),
    )

    library_item = relationship("LibraryItem", back_populates="sources")
    source_asset = relationship("SourceAsset")


class IdentificationCandidate(Base):
    __tablename__ = "identification_candidates"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("processing_jobs.id", ondelete="CASCADE"), nullable=False)
    source_asset_id = Column(String(36), ForeignKey("source_assets.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    suggested_title = Column(Text, nullable=False)
    suggested_creator = Column(Text, nullable=True)
    suggested_type = Column(String(50), nullable=True)
    confidence_score = Column(Numeric(4, 3), nullable=True)
    evidence_text = Column(Text, nullable=True)
    bounding_box = Column(JSON, nullable=True)
    provider_candidates = Column(JSON, default=list, nullable=False)
    resolution_status = Column(String(50), default="pending", nullable=False, index=True)
    resolved_library_item_id = Column(String(36), ForeignKey("library_items.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    job = relationship("ProcessingJob", back_populates="candidates")
    source_asset = relationship("SourceAsset", back_populates="candidates")


class ItemProgress(Base):
    __tablename__ = "item_progress"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    library_item_id = Column(String(36), ForeignKey("library_items.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    current_progress = Column(Numeric(8, 2), default=0.0, nullable=False)
    total_progress = Column(Numeric(8, 2), nullable=True)
    progress_unit = Column(String(30), default="percentage", nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    library_item = relationship("LibraryItem", back_populates="progress")


class ItemNote(Base):
    __tablename__ = "item_notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    library_item_id = Column(String(36), ForeignKey("library_items.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    library_item = relationship("LibraryItem", back_populates="notes")


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    benchmark_suite = Column(String(100), nullable=False)
    model_name = Column(String(100), nullable=False)
    prompt_version = Column(String(50), nullable=False)
    dataset_size = Column(Integer, nullable=False)
    precision_score = Column(Numeric(5, 4), nullable=True)
    recall_score = Column(Numeric(5, 4), nullable=True)
    review_rate = Column(Numeric(5, 4), nullable=True)
    avg_latency_ms = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    estimated_cost_usd = Column(Numeric(8, 4), nullable=True)
    details = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
