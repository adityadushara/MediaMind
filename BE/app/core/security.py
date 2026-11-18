import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Optional, Dict, Any, Tuple
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


def _decode_base64_segment(segment: str) -> bytes:
    remainder = len(segment) % 4
    if remainder:
        segment += "=" * (4 - remainder)
    return base64.urlsafe_b64decode(segment)


def decode_jwt_token(token: str, secret: Optional[str] = None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Decodes JWT token. If secret is provided, verifies HMAC-SHA256 signature and expiration.
    Returns (header, payload).
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT structure: must have 3 segments")

    header_bytes = _decode_base64_segment(parts[0])
    payload_bytes = _decode_base64_segment(parts[1])
    signature_bytes = _decode_base64_segment(parts[2])

    header = json.loads(header_bytes.decode("utf-8"))
    payload = json.loads(payload_bytes.decode("utf-8"))

    if secret:
        # Verify HMAC-SHA256 signature
        signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(signature_bytes, expected_sig):
            raise ValueError("JWT signature verification failed")

        # Check expiration claim
        exp = payload.get("exp")
        if exp is not None and time.time() > exp:
            raise ValueError("JWT token has expired")

    return header, payload


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    x_dev_user_id: Optional[str] = Header(None, alias="X-Dev-User-Id"),
) -> AuthenticatedUser:
    """
    Authenticate request via Supabase JWT.
    In production, strict cryptographic token validation is mandatory.
    Development fallback is strictly prevented from operating in production.
    """
    if credentials and credentials.credentials:
        token = credentials.credentials
        try:
            # If in production, verify signature with secret
            secret = settings.SUPABASE_JWT_SECRET if settings.ENVIRONMENT == "production" else None
            if settings.ENVIRONMENT == "production" and not secret:
                logger.error("Production environment missing SUPABASE_JWT_SECRET configuration!")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Server authentication configuration error"
                )

            _, payload = decode_jwt_token(token, secret=secret)
            user_id = payload.get("sub") or payload.get("user_id")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload: missing sub claim"
                )

            email = payload.get("email")
            role = payload.get("role", "authenticated")
            return AuthenticatedUser(user_id=user_id, email=email, role=role)

        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Authentication token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Authentication failed: {str(e)}"
            )

    # Development fallback: STRICTLY prohibited in production
    if settings.ENVIRONMENT == "development":
        dev_id = x_dev_user_id or "00000000-0000-0000-0000-000000000001"
        logger.debug(f"Using development authentication bypass for user: {dev_id}")
        return AuthenticatedUser(
            user_id=dev_id,
            email="dev@mediamind.local",
            role="authenticated"
        )

    # In production or any non-development environment, missing credentials strictly 401s
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid authentication credentials"
    )
