import io
from PIL import Image


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
