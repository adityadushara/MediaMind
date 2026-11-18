from typing import Dict, Tuple
from app.adapters.ai.prompts import v1_0_0

PROMPT_REGISTRY: Dict[str, Tuple[str, str, str]] = {
    "v1.0.0": (v1_0_0.PROMPT_IDENTIFIER, v1_0_0.EXTRACTION_SYSTEM_PROMPT, v1_0_0.EXTRACTION_USER_PROMPT),
}

DEFAULT_PROMPT_VERSION = "v1.0.0"


def get_prompt_version(version: str = DEFAULT_PROMPT_VERSION) -> Tuple[str, str, str]:
    """Returns (identifier, system_prompt, user_prompt) for the given version."""
    if version in PROMPT_REGISTRY:
        return PROMPT_REGISTRY[version]
    return PROMPT_REGISTRY[DEFAULT_PROMPT_VERSION]
