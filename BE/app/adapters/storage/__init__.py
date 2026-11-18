from app.adapters.storage.base import BaseStorageAdapter
from app.adapters.storage.local import LocalStorageAdapter
from app.adapters.storage.supabase import SupabaseStorageAdapter
from app.core.config import settings


def get_storage_adapter() -> BaseStorageAdapter:
    # Use LocalStorageAdapter if Supabase is placeholder or in local dev fallback
    if (
        "placeholder" in settings.SUPABASE_URL
        or "your-project" in settings.SUPABASE_URL
        or not settings.SUPABASE_SERVICE_ROLE_KEY
        or "placeholder" in settings.SUPABASE_SERVICE_ROLE_KEY
        or settings.SUPABASE_SERVICE_ROLE_KEY == "placeholder-service-key"
    ):
        return LocalStorageAdapter()
    return SupabaseStorageAdapter()
