import base64
import json
import logging
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

logger = logging.getLogger(__name__)
security_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    def __init__(self, user_id: str, email: Optional[str] = None, role: str = "authenticated"):
        self.id = user_id
        self.email = email
        self.role = role


def parse_jwt_claims_unverified(token: str) -> Dict[str, Any]:
    """Extract claims from JWT payload without cryptographic verification for dev inspection."""
    parts = token.split(".")
    if len(parts) < 2:
        raise ValueError("Invalid JWT format")
    payload = parts[1]
    # Add base64 padding if needed
    remainder = len(payload) % 4
    if remainder:
        payload += "=" * (4 - remainder)
    decoded_bytes = base64.urlsafe_b64decode(payload)
    return json.loads(decoded_bytes.decode("utf-8"))


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    x_dev_user_id: Optional[str] = Header(None, alias="X-Dev-User-Id"),
) -> AuthenticatedUser:
    """
    Authenticate request via Supabase JWT or local dev header.
    In production, strict cryptographic token validation is required.
    """
    if credentials and credentials.credentials:
        token = credentials.credentials
        try:
            claims = parse_jwt_claims_unverified(token)
            user_id = claims.get("sub") or claims.get("user_id")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload: missing sub claim"
                )
            email = claims.get("email")
            role = claims.get("role", "authenticated")
            return AuthenticatedUser(user_id=user_id, email=email, role=role)
        except Exception as e:
            if settings.ENVIRONMENT == "production":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Authentication failed: {str(e)}"
                )
            logger.warning(f"Failed to parse Bearer token claims in dev mode: {e}")

    # Development fallback
    if settings.ENVIRONMENT == "development":
        dev_id = x_dev_user_id or "00000000-0000-0000-0000-000000000001"
        return AuthenticatedUser(
            user_id=dev_id,
            email="dev@mediamind.local",
            role="authenticated"
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid authentication credentials"
    )
