from app.adapters.ai.gemini_adapter import (
    GeminiAdapter,
    GeminiExtractionResult,
    GeminiConfigurationError,
)


def get_ai_adapter() -> GeminiAdapter:
    return GeminiAdapter()


__all__ = [
    "GeminiAdapter",
    "GeminiExtractionResult",
    "GeminiConfigurationError",
    "get_ai_adapter",
]
