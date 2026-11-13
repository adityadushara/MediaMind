import os
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
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
    SUPABASE_STORAGE_BUCKET: str = "screenshots"

    # Database Configuration
    DATABASE_URL: str = Field(
        default="sqlite:///./mediamind_dev.db",
        description="PostgreSQL connection string or local SQLite fallback for offline dev/testing"
    )

    # Runtime AI (Gemini)
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_RUNTIME_MODEL: str = Field(default="gemini-2.5-flash")
    GEMINI_PROMPT_VERSION: str = Field(default="v1.0.0")

    # Local Storage fallback
    LOCAL_STORAGE_PATH: str = "./storage_data"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


settings = Settings()
