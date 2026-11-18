import io
import pytest
from unittest.mock import patch, AsyncMock
from PIL import Image
from app.core.config import settings


def generate_test_image(width: int = 200, height: int = 300, color: str = "blue") -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_asset_upload_and_job_creation(client):
    img_bytes = generate_test_image()
    files = [
        ("files", ("test_cover.png", io.BytesIO(img_bytes), "image/png"))
    ]

    response = client.post("/api/v1/assets/upload", files=files)
    assert response.status_code == 202
    data = response.json()
    assert data["total_count"] == 1
    asset_info = data["assets"][0]
    asset_id = asset_info["asset_id"]
    job_id = asset_info["job_id"]
    assert asset_info["mime_type"] == "image/png"
    assert asset_info["status"] == "awaiting_identification"
    assert asset_info["is_duplicate"] is False

    # Verify asset details
    asset_res = client.get(f"/api/v1/assets/{asset_id}")
    assert asset_res.status_code == 200
    asset_data = asset_res.json()
    assert asset_data["image_width"] == 200
    assert asset_data["image_height"] == 300
    assert asset_data["file_name"] == "test_cover.png"

    # Verify signed url
    url_res = client.get(f"/api/v1/assets/{asset_id}/url")
    assert url_res.status_code == 200
    assert "signed_url" in url_res.json()

    # Verify job details
    job_res = client.get(f"/api/v1/jobs/{job_id}")
    assert job_res.status_code == 200
    job_data = job_res.json()
    assert job_data["status"] == "awaiting_identification"
    assert job_data["source_asset_id"] == asset_id


def test_multiple_independent_uploads(client):
    img1 = generate_test_image(color="red")
    img2 = generate_test_image(color="green")
    files = [
        ("files", ("batch_1.png", io.BytesIO(img1), "image/png")),
        ("files", ("batch_2.png", io.BytesIO(img2), "image/png")),
    ]

    res = client.post("/api/v1/assets/upload", files=files)
    assert res.status_code == 202
    data = res.json()
    assert data["total_count"] == 2
    assert len(data["assets"]) == 2
    assert data["assets"][0]["asset_id"] != data["assets"][1]["asset_id"]
    assert data["assets"][0]["job_id"] != data["assets"][1]["job_id"]


def test_invalid_image_bytes(client):
    corrupted_data = b"This is not a real image stream"
    files = [("files", ("corrupt.png", io.BytesIO(corrupted_data), "image/png"))]
    res = client.post("/api/v1/assets/upload", files=files)
    assert res.status_code == 400
    assert "not a valid or readable image" in res.text


def test_oversized_image(client):
    fake_huge_data = b"X" * (16 * 1024 * 1024)  # 16 MB
    files = [("files", ("huge.png", io.BytesIO(fake_huge_data), "image/png"))]
    res = client.post("/api/v1/assets/upload", files=files)
    assert res.status_code == 413
    assert "exceeds maximum allowed size" in res.text


def test_upload_idempotency_via_header(client):
    img = generate_test_image(color="purple")
    key = "idem-key-unique-12345"

    files1 = [("files", ("purple.png", io.BytesIO(img), "image/png"))]
    res1 = client.post("/api/v1/assets/upload", files=files1, headers={"Idempotency-Key": key})
    assert res1.status_code == 202
    first_asset = res1.json()["assets"][0]
    assert first_asset["is_duplicate"] is False

    # Second upload with same Idempotency-Key returns existing asset without re-creating
    files2 = [("files", ("purple.png", io.BytesIO(img), "image/png"))]
    res2 = client.post("/api/v1/assets/upload", files=files2, headers={"Idempotency-Key": key})
    assert res2.status_code == 202
    second_asset = res2.json()["assets"][0]
    assert second_asset["is_duplicate"] is True
    assert second_asset["asset_id"] == first_asset["asset_id"]


def test_upload_idempotency_via_sha256_hash(client):
    img = generate_test_image(color="orange")

    # First upload
    res1 = client.post("/api/v1/assets/upload", files=[("files", ("orig.png", io.BytesIO(img), "image/png"))])
    asset_id_1 = res1.json()["assets"][0]["asset_id"]

    # Re-upload same image without force_reupload -> deduplicated
    res2 = client.post("/api/v1/assets/upload", files=[("files", ("dup.png", io.BytesIO(img), "image/png"))])
    assert res2.json()["assets"][0]["is_duplicate"] is True
    assert res2.json()["assets"][0]["asset_id"] == asset_id_1

    # Re-upload with force_reupload=true -> creates new record
    res3 = client.post("/api/v1/assets/upload?force_reupload=true", files=[("files", ("forced.png", io.BytesIO(img), "image/png"))])
    assert res3.json()["assets"][0]["is_duplicate"] is False
    assert res3.json()["assets"][0]["asset_id"] != asset_id_1


def test_storage_cleanup_on_db_failure(client):
    img = generate_test_image()
    # Simulate DB failure during asset insertion
    with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated DB commit error")):
        with patch("app.adapters.storage.local.LocalStorageAdapter.delete_file", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = True
            files = [("files", ("fail.png", io.BytesIO(img), "image/png"))]
            res = client.post("/api/v1/assets/upload", files=files)
            assert res.status_code == 500
            # Confirm storage cleanup was called
            assert mock_delete.called


def test_cleanup_failure_logging(client, caplog):
    img = generate_test_image()
    with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("Simulated DB commit error")):
        with patch("app.adapters.storage.local.LocalStorageAdapter.delete_file", side_effect=RuntimeError("Storage disk locked")):
            files = [("files", ("fail2.png", io.BytesIO(img), "image/png"))]
            res = client.post("/api/v1/assets/upload", files=files)
            assert res.status_code == 500
            # Confirm critical log was produced for orphaned object
            assert "ORPHANED_STORAGE_OBJECT" in caplog.text


def test_source_assets_list_search_and_pagination(client):
    # Upload 3 items
    for name in ["alpha_receipt.png", "beta_snapshot.png", "gamma_book.png"]:
        img = generate_test_image()
        client.post(
            "/api/v1/assets/upload?force_reupload=true",
            files=[("files", (name, io.BytesIO(img), "image/png"))]
        )

    # Search by filename
    res_search = client.get("/api/v1/assets?search=receipt")
    assert res_search.status_code == 200
    data = res_search.json()
    assert any("alpha_receipt" in item["file_name"] for item in data["items"])

    # Pagination
    res_page = client.get("/api/v1/assets?limit=1&offset=0")
    assert res_page.status_code == 200
    assert len(res_page.json()["items"]) == 1
    assert res_page.json()["total"] >= 3


def test_cross_user_source_asset_isolation(client):
    user_a_id = "user-a-1111-1111"
    user_b_id = "user-b-2222-2222"

    img = generate_test_image()
    # User A uploads
    res = client.post(
        "/api/v1/assets/upload",
        files=[("files", ("secret_a.png", io.BytesIO(img), "image/png"))],
        headers={"X-Dev-User-Id": user_a_id}
    )
    asset_id_a = res.json()["assets"][0]["asset_id"]

    # User B attempts to access User A's asset -> 404 Not Found
    res_b = client.get(f"/api/v1/assets/{asset_id_a}", headers={"X-Dev-User-Id": user_b_id})
    assert res_b.status_code == 404

    # User B attempts to get signed url for User A's asset -> 404 Not Found
    res_b_url = client.get(f"/api/v1/assets/{asset_id_a}/url", headers={"X-Dev-User-Id": user_b_id})
    assert res_b_url.status_code == 404


def test_serve_local_media_isolation(client):
    # Attempting to access another user's file path directly should return 403 Forbidden
    other_user_path = "screenshots/other-user-uuid-9999/test.png"
    res = client.get(f"/api/v1/assets/media/{other_user_path}")
    assert res.status_code == 403
    data = res.json()
    assert "error" in data or "detail" in data


def test_serve_local_media_production_disabled(client):
    original_env = settings.ENVIRONMENT
    settings.ENVIRONMENT = "production"
    try:
        # Without credentials in production, auth guard immediately rejects with 401
        unauth_res = client.get("/api/v1/assets/media/screenshots/any-user/test.png")
        assert unauth_res.status_code == 401

        # Even if an authenticated user bypass is somehow present, the endpoint itself returns 404
        from app.core.security import get_current_user, AuthenticatedUser
        from app.main import app
        app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser("any-user")
        try:
            auth_res = client.get("/api/v1/assets/media/screenshots/any-user/test.png")
            assert auth_res.status_code == 404
        finally:
            app.dependency_overrides.pop(get_current_user, None)
    finally:
        settings.ENVIRONMENT = original_env
