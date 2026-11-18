import json
import os
from pathlib import Path
from typing import List, Union
from pydantic import Field, AliasChoices, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "BE/.env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_NAME: str = "MediaMind API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Supabase Configuration
    SUPABASE_URL: str = Field(default="https://placeholder.supabase.co")
    SUPABASE_ANON_KEY: str = Field(default="placeholder-anon-key")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="placeholder-service-key")
    SUPABASE_JWT_SECRET: str = Field(default="", description="Supabase project JWT secret for signature verification")
    SUPABASE_STORAGE_BUCKET: str = "screenshots"

    # Database Configuration
    DATABASE_URL: str = Field(
        default="sqlite:///./mediamind_dev.db",
        description="PostgreSQL connection string or local SQLite fallback for offline dev/testing"
    )

    # Runtime AI (Gemini)
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_RUNTIME_MODEL: str = Field(
        default="gemini-3.1-flash-lite",
        validation_alias=AliasChoices("GEMINI_RUNTIME_MODEL", "GEMINI_MODEL_ID"),
        description="Canonical Gemini model identifier (supports legacy GEMINI_MODEL_ID alias)",
    )
    GEMINI_PRICING_TIER: str = Field(
        default="standard",
        description="Gemini pricing tier: 'standard' (pay-as-you-go) or 'free' (Google AI Studio rate-limited tier)",
    )
    GEMINI_PROMPT_VERSION: str = Field(default="v1.0.0")
    GEMINI_REQUEST_TIMEOUT: int = Field(default=30)
    GEMINI_MAX_OUTPUT_TOKENS: int = Field(default=4096)
    GEMINI_TEMPERATURE: float = Field(default=0.1)

    @property
    def GEMINI_MODEL_ID(self) -> str:
        """Backward-compatible property accessing the canonical runtime model."""
        return self.GEMINI_RUNTIME_MODEL

    # Image Preprocessing & CV
    MAX_IMAGE_DIMENSION: int = Field(default=1200, description="Max width/height for image derivatives and AI extraction")
    MIN_REGION_AREA_PERCENT: float = Field(default=0.01, description="Minimum region proposal area fraction")

    # Worker Configuration
    WORKER_ID: str = Field(default="worker-1")
    WORKER_POLL_INTERVAL_SECONDS: float = Field(default=0.5)
    WORKER_CONCURRENCY: int = Field(default=1)
    WORKER_LEASE_SECONDS: int = Field(default=300)

    # Metadata Providers (M4)
    GOOGLE_BOOKS_API_KEY: str = Field(default="")
    TMDB_API_KEY: str = Field(default="")
    YOUTUBE_API_KEY: str = Field(default="")
    METADATA_HTTP_TIMEOUT_SECONDS: float = Field(default=5.0)
    METADATA_MAX_RETRIES: int = Field(default=2)

    # Local Storage fallback
    LOCAL_STORAGE_PATH: str = "./storage_data"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, (list, tuple)):
            return list(v)
        return v

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    @field_validator("LOCAL_STORAGE_PATH", mode="before")
    @classmethod
    def normalize_local_storage_path(cls, v: str) -> str:
        if not v:
            v = "./storage_data"
        p = Path(v)
        if not p.is_absolute():
            repo_root = Path(__file__).resolve().parent.parent.parent.parent
            return str((repo_root / v).resolve())
        return str(p.resolve())


settings = Settings()
