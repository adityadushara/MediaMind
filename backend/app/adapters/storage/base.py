from abc import ABC, abstractmethod
from typing import Optional


class BaseStorageAdapter(ABC):
    @abstractmethod
    async def upload_file(self, file_path: str, data: bytes, mime_type: str) -> str:
        """Upload file bytes to target storage and return destination path/key."""
        pass

    @abstractmethod
    async def download_file(self, file_path: str) -> bytes:
        """Download and return raw file bytes from storage."""
        pass

    @abstractmethod
    async def get_signed_url(self, file_path: str, expires_in_seconds: int = 900) -> str:
        """Generate a temporary signed URL for client inspection."""
        pass

    @abstractmethod
    async def delete_file(self, file_path: str) -> bool:
        """Delete file from storage."""
        pass
