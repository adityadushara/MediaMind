import io
from PIL import Image
from app.core.config import settings


def generate_test_image() -> bytes:
    img = Image.new("RGB", (200, 300), color="blue")
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
    assert asset_info["status"] == "queued"

    # Verify asset details
    asset_res = client.get(f"/api/v1/assets/{asset_id}")
    assert asset_res.status_code == 200
    asset_data = asset_res.json()
    assert asset_data["image_width"] == 200
    assert asset_data["image_height"] == 300

    # Verify signed url
    url_res = client.get(f"/api/v1/assets/{asset_id}/url")
    assert url_res.status_code == 200
    assert "signed_url" in url_res.json()

    # Verify job details
    job_res = client.get(f"/api/v1/jobs/{job_id}")
    assert job_res.status_code == 200
    job_data = job_res.json()
    assert job_data["status"] == "queued"
    assert job_data["source_asset_id"] == asset_id


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
