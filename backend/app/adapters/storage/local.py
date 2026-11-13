import os
from pathlib import Path
from typing import Optional
from app.adapters.storage.base import BaseStorageAdapter
from app.core.config import settings


class LocalStorageAdapter(BaseStorageAdapter):
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or settings.LOCAL_STORAGE_PATH)
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def upload_file(self, file_path: str, data: bytes, mime_type: str) -> str:
        clean_path = file_path.lstrip("/").replace("\\", "/")
        target_file = self.base_path / clean_path
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "wb") as f:
            f.write(data)
        return clean_path

    async def download_file(self, file_path: str) -> bytes:
        clean_path = file_path.lstrip("/").replace("\\", "/")
        target_file = self.base_path / clean_path
        if not target_file.exists():
            raise FileNotFoundError(f"Storage file not found: {file_path}")
        with open(target_file, "rb") as f:
            return f.read()

    async def get_signed_url(self, file_path: str, expires_in_seconds: int = 900) -> str:
        clean_path = file_path.lstrip("/").replace("\\", "/")
        # For local dev, return a local media path URL
        return f"/api/v1/assets/media/{clean_path}"

    async def delete_file(self, file_path: str) -> bool:
        clean_path = file_path.lstrip("/").replace("\\", "/")
        target_file = self.base_path / clean_path
        if target_file.exists():
            target_file.unlink()
            return True
        return False
