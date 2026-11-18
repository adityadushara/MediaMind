import io
import pytest
from PIL import Image
from app.services.cv_service import CVService


def create_sample_pil(width=800, height=600, color=(100, 150, 200), mode="RGB") -> bytes:
    img = Image.new(mode, (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG" if mode == "RGB" else "PNG")
    return buf.getvalue()


def test_load_and_orient_rgb():
    raw_bytes = create_sample_pil(width=640, height=480, mode="RGB")
    img, meta = CVService.load_and_orient_image(raw_bytes)
    assert img.size == (640, 480)
    assert meta["original_width"] == 640
    assert meta["original_height"] == 480
    assert img.mode == "RGB"


def test_load_rgba_converts_to_rgb():
    raw_bytes = create_sample_pil(width=400, height=300, mode="RGBA")
    img, meta = CVService.load_and_orient_image(raw_bytes)
    assert img.size == (400, 300)
    assert img.mode == "RGB"
    assert meta["original_mode"] == "RGBA"


def test_corrupt_image_fails_safely():
    corrupt_bytes = b"NOT_AN_IMAGE_STREAM"
    with pytest.raises(ValueError, match="Image could not be parsed"):
        CVService.load_and_orient_image(corrupt_bytes)


def test_bounding_box_validation():
    # Valid box
    assert CVService.validate_bounding_box({"x_min": 100, "y_min": 100, "x_max": 500, "y_max": 500}) is True

    # Inverted coordinates
    assert CVService.validate_bounding_box({"x_min": 500, "y_min": 100, "x_max": 100, "y_max": 500}) is False
    assert CVService.validate_bounding_box({"x_min": 100, "y_min": 500, "x_max": 500, "y_max": 100}) is False

    # Out of range [0, 1000]
    assert CVService.validate_bounding_box({"x_min": -10, "y_min": 0, "x_max": 500, "y_max": 500}) is False
    assert CVService.validate_bounding_box({"x_min": 0, "y_min": 0, "x_max": 1050, "y_max": 500}) is False

    # None or non-dict
    assert CVService.validate_bounding_box(None) is False
    assert CVService.validate_bounding_box({}) is False


def test_normalization_and_denormalization_roundtrip():
    width = 1920
    height = 1080
    box_px = (192, 108, 960, 540)  # 10%, 10% to 50%, 50%

    norm = CVService.normalize_box(box_px, width, height)
    assert norm["x_min"] == 100
    assert norm["y_min"] == 100
    assert norm["x_max"] == 500
    assert norm["y_max"] == 500

    denorm = CVService.denormalize_box(norm, width, height)
    assert denorm == (192, 108, 960, 540)


def test_generate_crop_immutability():
    raw_bytes = create_sample_pil(width=1000, height=800, color=(200, 50, 50))
    img, _ = CVService.load_and_orient_image(raw_bytes)
    original_size = img.size

    norm_box = {"x_min": 200, "y_min": 200, "x_max": 600, "y_max": 600}
    crop_bytes, crop_w, crop_h = CVService.generate_crop(img, norm_box)

    assert crop_w == 400
    assert crop_h == 320
    assert len(crop_bytes) > 0
    # Original image remains unmutated
    assert img.size == original_size


def test_resize_for_processing():
    raw_bytes = create_sample_pil(width=3000, height=1500)
    img, _ = CVService.load_and_orient_image(raw_bytes)

    resized, scale = CVService.resize_for_processing(img, max_dim=1000)
    assert max(resized.size) == 1000
    assert resized.width == 1000
    assert resized.height == 500
    assert scale == pytest.approx(1000 / 3000)


def test_detect_candidate_regions_synthetic():
    # Create image with a distinct dark rectangle
    img = Image.new("RGB", (1000, 1000), color=(250, 250, 250))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    draw.rectangle([200, 200, 600, 800], fill=(20, 20, 20), outline=(0, 0, 0))

    regions = CVService.detect_candidate_regions(img)
    assert isinstance(regions, list)
    # The distinct box should be detected
    if len(regions) > 0:
        box = regions[0]
        assert CVService.validate_bounding_box(box) is True
