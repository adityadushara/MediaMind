import pytest
from app.adapters.storage.local import LocalStorageAdapter
from app.adapters.storage.supabase import SupabaseStorageAdapter


@pytest.mark.asyncio
async def test_local_storage_adapter(tmp_path):
    adapter = LocalStorageAdapter(base_path=str(tmp_path))
    test_data = b"MediaMind storage test content"
    dest_path = "test_sub/sample.txt"

    # Upload
    uploaded_path = await adapter.upload_file(dest_path, test_data, "text/plain")
    assert "sample.txt" in uploaded_path

    # Download
    downloaded_data = await adapter.download_file(dest_path)
    assert downloaded_data == test_data

    # Signed URL
    url = await adapter.get_signed_url(dest_path)
    assert "/media/" in url

    # Delete
    deleted = await adapter.delete_file(dest_path)
    assert deleted is True

    # Confirm deleted
    with pytest.raises(FileNotFoundError):
        await adapter.download_file(dest_path)


def test_supabase_object_keys_are_bucket_relative():
    """Application paths carry a `screenshots/` root that is the bucket itself.

    Regression: keys were sent as `screenshots/{user}/file.png` to bucket
    `screenshots`, resolving to `screenshots/screenshots/...` and failing every
    download, signed URL and delete with 404.
    """
    adapter = SupabaseStorageAdapter()

    assert adapter._object_key("screenshots/user-1/file.png") == "user-1/file.png"
    assert adapter._object_key("/screenshots/user-1/file.png") == "user-1/file.png"
    assert adapter._object_key("user-1/file.png") == "user-1/file.png"
    # Only the configured bucket prefix is stripped.
    assert adapter._object_key("screenshots-old/file.png") == "screenshots-old/file.png"


@pytest.mark.asyncio
async def test_storage_path_traversal_prevention(tmp_path):
    adapter = LocalStorageAdapter(base_path=str(tmp_path))

    # Attempting to upload outside base path
    with pytest.raises(PermissionError, match="Path traversal detected"):
        await adapter.upload_file("../escape.txt", b"malicious", "text/plain")

    # Attempting to download outside base path
    with pytest.raises(PermissionError, match="Path traversal detected"):
        await adapter.download_file("../../etc/passwd")

    # Attempting to delete outside base path
    with pytest.raises(PermissionError, match="Path traversal detected"):
        await adapter.delete_file("../outside.txt")
