import json
import logging
import time
import random
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.config import settings
from app.adapters.ai.prompts import get_prompt_version, DEFAULT_PROMPT_VERSION
from app.schemas.common import GeminiCandidateOutput, GeminiExtractionResponse

logger = logging.getLogger(__name__)


class GeminiExtractionResult(BaseModel):
    """
    Standardized result object returned by GeminiAdapter.
    Captures extracted candidates alongside telemetry, tokens, latency, and costs.
    """
    candidates: List[GeminiCandidateOutput] = Field(default_factory=list)
    prompt_identifier: str
    prompt_version: str
    ai_model_name: str
    duration_ms: int
    prompt_tokens: int = 0
    candidate_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    pricing_tier: str = "standard"
    raw_response_text: Optional[str] = None
    error_category: Optional[str] = None
    error_message: Optional[str] = None


class GeminiConfigurationError(Exception):
    """Raised when Gemini configuration (e.g. API key) is missing or invalid."""
    pass


class GeminiAdapter:
    """
    Production-grade Gemini API adapter for Multimodal Media Extraction.
    Enforces structured JSON output via Pydantic, prompt versioning, transient error retries,
    token usage tracking, and cost estimation.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        pricing_tier: Optional[str] = None,
        request_timeout: Optional[int] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model_name = model_name or settings.GEMINI_RUNTIME_MODEL
        self.pricing_tier = pricing_tier or getattr(settings, "GEMINI_PRICING_TIER", "standard")
        self.request_timeout = request_timeout or settings.GEMINI_REQUEST_TIMEOUT
        self.temperature = temperature if temperature is not None else settings.GEMINI_TEMPERATURE
        self.max_output_tokens = max_output_tokens or settings.GEMINI_MAX_OUTPUT_TOKENS

        self._client: Optional[genai.Client] = None
        if self.api_key:
            self._client = genai.Client(api_key=self.api_key)

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip() != "")

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "model_name": self.model_name,
            "pricing_tier": self.pricing_tier,
            "configured": self.is_configured(),
            "timeout_seconds": self.request_timeout,
            "temperature": self.temperature,
            "max_output_tokens": self.max_output_tokens,
            "default_prompt_version": settings.GEMINI_PROMPT_VERSION,
        }

    def health_check(self) -> Dict[str, Any]:
        if not self.is_configured():
            return {
                "status": "unconfigured",
                "message": "GEMINI_API_KEY is not set",
                "model": self.model_name
            }
        return {
            "status": "ready",
            "message": "Gemini client initialized with API key",
            "model": self.model_name
        }

    def _estimate_cost_usd(self, prompt_tokens: int, candidate_tokens: int, model_name: Optional[str] = None) -> float:
        """
        Estimates USD cost based on official Google Gemini API pricing tables:

        Free Tier: $0.00 (rate-limited prototyping via Google AI Studio).

        Standard Pay-as-you-go Tiers (prompts <= 200k tokens):
        - gemini-2.5-flash: $0.30 / 1M input ($0.00000030/token), $2.50 / 1M output ($0.00000250/token)
        - gemini-2.0-flash: $0.15 / 1M input ($0.00000015/token), $0.60 / 1M output ($0.00000060/token)
        - gemini-1.5-flash: $0.075 / 1M input ($0.000000075/token), $0.30 / 1M output ($0.00000030/token)
        - gemini-2.5-pro:   $1.25 / 1M input ($0.00000125/token), $10.00 / 1M output ($0.00001000/token)
        - gemini-1.5-pro:   $1.25 / 1M input ($0.00000125/token), $5.00 / 1M output ($0.00000500/token)
        """
        if self.pricing_tier == "free":
            return 0.0

        model = (model_name or self.model_name).lower()
        if "2.5-flash" in model or "3.8-flash" in model or "3.5-flash" in model:
            input_rate = 0.30 / 1_000_000
            output_rate = 2.50 / 1_000_000
        elif "2.0-flash" in model:
            input_rate = 0.15 / 1_000_000
            output_rate = 0.60 / 1_000_000
        elif "1.5-flash" in model:
            input_rate = 0.075 / 1_000_000
            output_rate = 0.30 / 1_000_000
        elif "2.5-pro" in model:
            input_rate = 1.25 / 1_000_000
            output_rate = 10.00 / 1_000_000
        elif "pro" in model:
            input_rate = 1.25 / 1_000_000
            output_rate = 5.00 / 1_000_000
        else:
            input_rate = 0.30 / 1_000_000
            output_rate = 2.50 / 1_000_000

        input_cost = prompt_tokens * input_rate
        output_cost = candidate_tokens * output_rate
        return round(input_cost + output_cost, 6)

    def extract_candidates(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        prompt_version: Optional[str] = None,
        max_retries: int = 3
    ) -> GeminiExtractionResult:
        """
        Analyzes a screenshot with Gemini Multimodal model and returns schema-validated candidates.
        Handles transient 429/503 errors using exponential backoff with jitter.
        """
        if not self.is_configured() or not self._client:
            raise GeminiConfigurationError("GEMINI_API_KEY environment variable is not set")

        version = prompt_version or settings.GEMINI_PROMPT_VERSION
        prompt_id, system_instruction, user_instruction = get_prompt_version(version)

        start_time = time.time()
        last_exception: Optional[Exception] = None

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=GeminiExtractionResponse,
            temperature=self.temperature,
            max_output_tokens=self.max_output_tokens,
        )

        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            user_instruction,
        ]

        for attempt in range(max_retries + 1):
            try:
                response = self._client.models.generate_content(
                    model=self.model_name,
                    contents=contents,
                    config=config,
                )

                duration_ms = int((time.time() - start_time) * 1000)
                raw_text = response.text or "{}"

                # Parse usage metadata
                prompt_tokens = 0
                candidate_tokens = 0
                total_tokens = 0
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    prompt_tokens = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
                    candidate_tokens = getattr(response.usage_metadata, "candidates_token_count", 0) or 0
                    total_tokens = getattr(response.usage_metadata, "total_token_count", 0) or 0

                estimated_cost = self._estimate_cost_usd(prompt_tokens, candidate_tokens)

                # Parse and validate output with Pydantic
                try:
                    parsed_response = GeminiExtractionResponse.model_validate_json(raw_text)
                    candidates = parsed_response.candidates
                except Exception as parse_err:
                    logger.warning(f"Failed to validate Gemini JSON output directly: {parse_err}. Raw text: {raw_text[:200]}")
                    candidates = self._recover_candidates_from_text(raw_text)

                return GeminiExtractionResult(
                    candidates=candidates,
                    prompt_identifier=prompt_id,
                    prompt_version=version,
                    ai_model_name=self.model_name,
                    duration_ms=duration_ms,
                    prompt_tokens=prompt_tokens,
                    candidate_tokens=candidate_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_usd=estimated_cost,
                    pricing_tier=self.pricing_tier,
                    raw_response_text=raw_text,
                )

            except APIError as api_err:
                last_exception = api_err
                error_code = getattr(api_err, "code", None)
                err_str = str(api_err).lower()
                is_daily_quota_exhausted = (
                    "per day" in err_str or
                    "free_tier_requests" in err_str or
                    "daily limit" in err_str
                )

                # Transient errors: 429 Rate Limit (short-term RPM spike), 503 Unavailable -> Retry with exponential backoff
                # Do NOT retry immediately if daily quota (20 requests/day) has been completely exhausted
                if error_code in (429, 503) and attempt < max_retries and not is_daily_quota_exhausted:
                    sleep_time = (2 ** attempt) + random.uniform(0.1, 0.5)
                    logger.warning(f"Gemini transient error ({error_code}) on attempt {attempt + 1}. Retrying in {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                    continue

                # Non-transient errors or exhausted retries
                duration_ms = int((time.time() - start_time) * 1000)
                category = "rate_limit" if error_code == 429 else ("service_unavailable" if error_code == 503 else "api_error")
                error_msg = str(api_err)
                if is_daily_quota_exhausted:
                    error_msg = (
                        "Gemini API Free Tier daily limit exceeded (20 requests/day). "
                        "To fix: switch GEMINI_RUNTIME_MODEL in BE/.env to 'gemini-3.5-flash-lite' (higher free quota) "
                        "or enable Pay-As-You-Go in Google AI Studio."
                    )

                return GeminiExtractionResult(
                    candidates=[],
                    prompt_identifier=prompt_id,
                    prompt_version=version,
                    ai_model_name=self.model_name,
                    duration_ms=duration_ms,
                    error_category=category,
                    error_message=error_msg,
                )

            except Exception as e:
                last_exception = e
                duration_ms = int((time.time() - start_time) * 1000)
                logger.error(f"Unexpected error during Gemini extraction: {e}")
                return GeminiExtractionResult(
                    candidates=[],
                    prompt_identifier=prompt_id,
                    prompt_version=version,
                    ai_model_name=self.model_name,
                    duration_ms=duration_ms,
                    error_category="unexpected_error",
                    error_message=str(e),
                )

        duration_ms = int((time.time() - start_time) * 1000)
        return GeminiExtractionResult(
            candidates=[],
            prompt_identifier=prompt_id,
            prompt_version=version,
            ai_model_name=self.model_name,
            duration_ms=duration_ms,
            error_category="retries_exhausted",
            error_message=str(last_exception),
        )

    def _recover_candidates_from_text(self, raw_text: str) -> List[GeminiCandidateOutput]:
        """
        Attempts fallback parsing if Gemini output has surrounding markdown fences.
        """
        clean_text = raw_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        try:
            data = json.loads(clean_text)
            if isinstance(data, dict) and "candidates" in data:
                res = GeminiExtractionResponse.model_validate(data)
                return res.candidates
            elif isinstance(data, list):
                res = GeminiExtractionResponse(candidates=data)
                return res.candidates
        except Exception:
            pass
        return []
