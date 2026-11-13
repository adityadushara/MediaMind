import pytest
from app.adapters.storage.local import LocalStorageAdapter


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
