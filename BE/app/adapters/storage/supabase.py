import logging
import httpx
from typing import Optional
from app.adapters.storage.base import BaseStorageAdapter
from app.core.config import settings

logger = logging.getLogger(__name__)


class SupabaseStorageAdapter(BaseStorageAdapter):
    def __init__(self, bucket_name: Optional[str] = None):
        self.bucket = bucket_name or settings.SUPABASE_STORAGE_BUCKET
        self.base_url = settings.SUPABASE_URL.rstrip("/")
        self.api_key = settings.SUPABASE_SERVICE_ROLE_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "apikey": self.api_key,
        }

    def _object_key(self, file_path: str) -> str:
        """Return a bucket-relative object key for ``file_path``.

        Application paths are stored as ``screenshots/{user_id}/{file}`` because
        the local adapter roots its filesystem at ``storage_data/``. Supabase
        object keys, however, are relative to the bucket itself, so a leading
        ``{bucket}/`` segment would address ``{bucket}/{bucket}/{user_id}/...``
        and every download or signed URL would 404. Strip it here so rows
        written by either storage backend resolve correctly.
        """
        clean_path = file_path.lstrip("/\\").replace("\\", "/")
        prefix = f"{self.bucket}/"
        if clean_path.startswith(prefix):
            clean_path = clean_path[len(prefix):]
        return clean_path

    async def upload_file(self, file_path: str, data: bytes, mime_type: str) -> str:
        # Keep the application-level path (with its `screenshots/` root) as the
        # stored value so both storage backends agree on `source_assets.file_path`
        # and the media route's ownership guard keeps working.
        logical_path = file_path.lstrip("/\\").replace("\\", "/")
        clean_path = self._object_key(logical_path)
        url = f"{self.base_url}/storage/v1/object/{self.bucket}/{clean_path}"
        headers = {**self.headers, "Content-Type": mime_type}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, content=data, headers=headers)
            if resp.status_code not in (200, 201):
                logger.error(f"Supabase upload failed [{resp.status_code}]: {resp.text}")
                raise RuntimeError(f"Storage upload failed: {resp.text}")
        return logical_path

    async def download_file(self, file_path: str) -> bytes:
        clean_path = self._object_key(file_path)
        url = f"{self.base_url}/storage/v1/object/authenticated/{self.bucket}/{clean_path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self.headers)
            if resp.status_code != 200:
                logger.error(f"Supabase download failed [{resp.status_code}]: {resp.text}")
                raise RuntimeError(f"Storage download failed: {resp.text}")
            return resp.content

    async def get_signed_url(self, file_path: str, expires_in_seconds: int = 900) -> str:
        clean_path = self._object_key(file_path)
        url = f"{self.base_url}/storage/v1/object/sign/{self.bucket}/{clean_path}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json={"expiresIn": expires_in_seconds}, headers=self.headers)
            if resp.status_code == 200:
                data = resp.json()
                signed_path = data.get("signedURL")
                return f"{self.base_url}/storage/v1{signed_path}"
            logger.warning(f"Failed to generate Supabase signed URL: {resp.text}")
            return f"{self.base_url}/storage/v1/object/public/{self.bucket}/{clean_path}"

    async def delete_file(self, file_path: str) -> bool:
        clean_path = self._object_key(file_path)
        url = f"{self.base_url}/storage/v1/object/{self.bucket}/{clean_path}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(url, headers=self.headers)
            return resp.status_code in (200, 204)
