import os
from pathlib import Path
from typing import Optional
from app.adapters.storage.base import BaseStorageAdapter
from app.core.config import settings


class LocalStorageAdapter(BaseStorageAdapter):
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or settings.LOCAL_STORAGE_PATH).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, file_path: str) -> Path:
        """Resolve path and enforce that it cannot escape base_path via traversal."""
        clean_path = file_path.lstrip("/\\").replace("\\", "/")
        target = (self.base_path / clean_path).resolve()
        if not target.is_relative_to(self.base_path):
            raise PermissionError(f"Access denied: Path traversal detected outside storage boundary: {file_path}")
        return target

    async def upload_file(self, file_path: str, data: bytes, mime_type: str) -> str:
        target_file = self._resolve_safe_path(file_path)
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "wb") as f:
            f.write(data)
        # Return relative storage path
        return str(target_file.relative_to(self.base_path)).replace("\\", "/")

    async def download_file(self, file_path: str) -> bytes:
        target_file = self._resolve_safe_path(file_path)
        if not target_file.exists():
            raise FileNotFoundError(f"Storage file not found: {file_path}")
        with open(target_file, "rb") as f:
            return f.read()

    async def get_signed_url(self, file_path: str, expires_in_seconds: int = 900) -> str:
        clean_path = file_path.lstrip("/\\").replace("\\", "/")
        # Local development URL; validated by serve_local_media
        return f"/api/v1/assets/media/{clean_path}"

    async def delete_file(self, file_path: str) -> bool:
        target_file = self._resolve_safe_path(file_path)
        if target_file.exists():
            target_file.unlink()
            return True
        return False
