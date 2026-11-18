import os
import pytest
from unittest.mock import MagicMock, patch
from google.genai.errors import APIError

from app.adapters.ai.gemini_adapter import (
    GeminiAdapter,
    GeminiConfigurationError,
    GeminiExtractionResult,
)
from app.schemas.common import GeminiCandidateOutput, BoundingBox
from app.core.config import settings


def test_gemini_unconfigured_health_and_error():
    adapter = GeminiAdapter(api_key="")
    assert adapter.is_configured() is False
    health = adapter.health_check()
    assert health["status"] == "unconfigured"

    with pytest.raises(GeminiConfigurationError, match="GEMINI_API_KEY environment variable is not set"):
        adapter.extract_candidates(b"fake_bytes")


def test_gemini_model_info():
    adapter = GeminiAdapter(api_key="dummy_key", model_name="gemini-2.5-flash", request_timeout=45)
    info = adapter.get_model_info()
    assert info["model_name"] == "gemini-2.5-flash"
    assert info["configured"] is True
    assert info["timeout_seconds"] == 45


def test_gemini_configuration_model_id_alias():
    from app.core.config import Settings
    s1 = Settings(GEMINI_RUNTIME_MODEL="gemini-2.5-flash", _env_file=None)
    assert s1.GEMINI_RUNTIME_MODEL == "gemini-2.5-flash"
    assert s1.GEMINI_MODEL_ID == "gemini-2.5-flash"

    s2 = Settings(GEMINI_MODEL_ID="gemini-2.5-pro", _env_file=None)
    assert s2.GEMINI_RUNTIME_MODEL == "gemini-2.5-pro"
    assert s2.GEMINI_MODEL_ID == "gemini-2.5-pro"


def test_gemini_successful_extraction_parsing():
    sample_json = """{
        "candidates": [
            {
                "content_type": "book",
                "title": "Designing Data-Intensive Applications",
                "creator": "Martin Kleppmann",
                "additional_creators": [],
                "description_clue": "Reliable, Scalable, and Maintainable Systems",
                "year_clue": 2017,
                "visible_text": ["Designing Data-Intensive Applications", "Martin Kleppmann", "O'REILLY"],
                "identifying_clues": ["O'Reilly animal cover", "Book cover layout"],
                "bounding_box": {
                    "x_min": 150,
                    "y_min": 100,
                    "x_max": 850,
                    "y_max": 900
                },
                "confidence": 0.95,
                "evidence": ["Title clearly visible in large font", "Author printed below title"],
                "uncertainty_reasons": []
            }
        ],
        "detected_regions_count": 1
    }"""

    adapter = GeminiAdapter(api_key="dummy_key", model_name="gemini-2.5-flash")

    mock_response = MagicMock()
    mock_response.text = sample_json
    mock_response.usage_metadata.prompt_token_count = 1200
    mock_response.usage_metadata.candidates_token_count = 180
    mock_response.usage_metadata.total_token_count = 1380

    with patch.object(adapter._client.models, "generate_content", return_value=mock_response):
        res = adapter.extract_candidates(b"dummy_image_bytes")

        assert isinstance(res, GeminiExtractionResult)
        assert len(res.candidates) == 1
        candidate = res.candidates[0]
        assert candidate.title == "Designing Data-Intensive Applications"
        assert candidate.creator == "Martin Kleppmann"
        assert candidate.content_type == "book"
        assert candidate.bounding_box.x_min == 150
        assert candidate.confidence == 0.95
        assert res.prompt_tokens == 1200
        assert res.candidate_tokens == 180
        assert res.total_tokens == 1380
        # Gemini 2.5 Flash: (1200 * 0.00000030) + (180 * 0.00000250) = 0.000360 + 0.000450 = 0.000810
        assert res.estimated_cost_usd == 0.000810
        assert res.pricing_tier == "standard"
        assert res.error_category is None


def test_gemini_official_pricing_calculation():
    # 1. Gemini 2.5 Flash standard tier
    adapter_flash_25 = GeminiAdapter(api_key="dummy", model_name="gemini-2.5-flash", pricing_tier="standard")
    cost_25 = adapter_flash_25._estimate_cost_usd(1200, 180)
    assert cost_25 == 0.000810

    # 2. Gemini 1.5 Flash standard tier
    adapter_flash_15 = GeminiAdapter(api_key="dummy", model_name="gemini-1.5-flash", pricing_tier="standard")
    cost_15 = adapter_flash_15._estimate_cost_usd(1200, 180)
    assert cost_15 == 0.000144

    # 3. Gemini 2.0 Flash standard tier
    adapter_flash_20 = GeminiAdapter(api_key="dummy", model_name="gemini-2.0-flash", pricing_tier="standard")
    cost_20 = adapter_flash_20._estimate_cost_usd(1200, 180)
    assert cost_20 == 0.000288

    # 4. Free tier
    adapter_free = GeminiAdapter(api_key="dummy", model_name="gemini-2.5-flash", pricing_tier="free")
    assert adapter_free._estimate_cost_usd(1200, 180) == 0.0


def test_gemini_empty_candidate_response():
    sample_json = '{"candidates": [], "detected_regions_count": 0}'
    adapter = GeminiAdapter(api_key="dummy_key", model_name="gemini-2.5-flash")

    mock_response = MagicMock()
    mock_response.text = sample_json
    mock_response.usage_metadata.prompt_token_count = 800
    mock_response.usage_metadata.candidates_token_count = 20
    mock_response.usage_metadata.total_token_count = 820

    with patch.object(adapter._client.models, "generate_content", return_value=mock_response):
        res = adapter.extract_candidates(b"dummy_bytes")
        assert len(res.candidates) == 0
        assert res.error_category is None


def test_gemini_markdown_fence_fallback_recovery():
    sample_text = """```json
    {
        "candidates": [
            {
                "content_type": "movie",
                "title": "Inception",
                "creator": "Christopher Nolan",
                "bounding_box": {"x_min": 100, "y_min": 100, "x_max": 900, "y_max": 900},
                "confidence": 0.88
            }
        ]
    }
    ```"""
    adapter = GeminiAdapter(api_key="dummy_key", model_name="gemini-2.5-flash")

    mock_response = MagicMock()
    mock_response.text = sample_text
    mock_response.usage_metadata = None

    with patch.object(adapter._client.models, "generate_content", return_value=mock_response):
        res = adapter.extract_candidates(b"dummy_bytes")
        assert len(res.candidates) == 1
        assert res.candidates[0].title == "Inception"
        assert res.candidates[0].content_type == "movie"


def test_gemini_api_error_handling():
    adapter = GeminiAdapter(api_key="dummy_key", model_name="gemini-2.5-flash")

    err = APIError(400, {"message": "Invalid request parameter"})
    with patch.object(adapter._client.models, "generate_content", side_effect=err):
        res = adapter.extract_candidates(b"dummy_bytes", max_retries=1)
        assert len(res.candidates) == 0
        assert res.error_category == "api_error"
        assert "Invalid request parameter" in res.error_message


def test_gemini_transient_rate_limit_retry():
    adapter = GeminiAdapter(api_key="dummy_key", model_name="gemini-2.5-flash")

    rate_limit_err = APIError(429, {"message": "Quota exceeded"})
    success_json = '{"candidates": [{"content_type": "course", "title": "Machine Learning", "confidence": 0.8}]}'
    mock_success = MagicMock()
    mock_success.text = success_json
    mock_success.usage_metadata = None

    # Fails once with 429, then succeeds on retry
    with patch.object(adapter._client.models, "generate_content", side_effect=[rate_limit_err, mock_success]) as mock_call:
        with patch("time.sleep", return_value=None):  # Avoid actual sleep in test
            res = adapter.extract_candidates(b"dummy_bytes", max_retries=2)
            assert mock_call.call_count == 2
            assert len(res.candidates) == 1
            assert res.candidates[0].title == "Machine Learning"
            assert res.error_category is None


@pytest.mark.skipif(
    not os.environ.get("RUN_LIVE_GEMINI_TESTS"),
    reason="Live Gemini integration test requires RUN_LIVE_GEMINI_TESTS=1 and live GEMINI_API_KEY"
)
def test_live_gemini_api_call():
    """Live integration test against Google Gemini API."""
    api_key = os.environ.get("GEMINI_API_KEY") or settings.GEMINI_API_KEY
    if not api_key or "placeholder" in api_key.lower():
        pytest.skip("GEMINI_API_KEY not configured with live credentials (BLOCKED: API_KEY_NOT_CONFIGURED)")

    model_name = os.environ.get("GEMINI_RUNTIME_MODEL") or settings.GEMINI_RUNTIME_MODEL
    adapter = GeminiAdapter(api_key=api_key, model_name=model_name)
    from PIL import Image
    import io
    img = Image.new("RGB", (100, 100), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    res = adapter.extract_candidates(buf.getvalue())
    assert isinstance(res, GeminiExtractionResult)
    if res.error_category:
        pytest.fail(f"Live Gemini extraction returned error: {res.error_category} - {res.error_message}")
    assert res.prompt_tokens > 0
    assert res.ai_model_name == adapter.model_name
