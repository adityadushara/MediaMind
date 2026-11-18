import base64
import hashlib
import hmac
import json
import time
import pytest
from app.core.config import settings
from app.core.security import decode_jwt_token


def create_signed_token(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h_bytes = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    p_bytes = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signing_input = f"{h_bytes}.{p_bytes}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_bytes = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{h_bytes}.{p_bytes}.{sig_bytes}"


def test_auth_me_endpoint_dev_mode(client):
    # In development mode, request without token uses dev user fallback
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["role"] == "authenticated"


def test_auth_me_with_custom_dev_header(client):
    custom_id = "11111111-2222-3333-4444-555555555555"
    response = client.get("/api/v1/auth/me", headers={"X-Dev-User-Id": custom_id})
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == custom_id


def test_jwt_signature_verification():
    secret = "test-supabase-jwt-secret-key-12345"
    payload = {
        "sub": "user-valid-123",
        "email": "user@test.com",
        "exp": time.time() + 3600
    }
    token = create_signed_token(payload, secret)

    # Valid token & secret
    _, verified_payload = decode_jwt_token(token, secret=secret)
    assert verified_payload["sub"] == "user-valid-123"

    # Forged token (wrong secret)
    with pytest.raises(ValueError, match="JWT signature verification failed"):
        decode_jwt_token(token, secret="wrong-secret-key")

    # Expired token
    expired_payload = {
        "sub": "user-expired",
        "exp": time.time() - 100
    }
    expired_token = create_signed_token(expired_payload, secret)
    with pytest.raises(ValueError, match="JWT token has expired"):
        decode_jwt_token(expired_token, secret=secret)


def test_production_mode_rejects_unauthenticated_and_dev_header(client):
    # Temporarily simulate production environment
    original_env = settings.ENVIRONMENT
    settings.ENVIRONMENT = "production"
    try:
        # Request with dev header must fail with 401 in production
        res = client.get("/api/v1/auth/me", headers={"X-Dev-User-Id": "attacker-id"})
        assert res.status_code == 401
        data = res.json()
        assert "error" in data or "detail" in data
    finally:
        settings.ENVIRONMENT = original_env


def test_cors_origin_validator_supports_csv_and_json():
    from app.core.config import Settings
    s1 = Settings(BACKEND_CORS_ORIGINS="https://app.vercel.app, https://custom.com")
    assert s1.BACKEND_CORS_ORIGINS == ["https://app.vercel.app", "https://custom.com"]

    s2 = Settings(BACKEND_CORS_ORIGINS='["https://json-origin.vercel.app"]')
    assert s2.BACKEND_CORS_ORIGINS == ["https://json-origin.vercel.app"]


def test_database_url_normalizes_postgres_scheme():
    from app.core.config import Settings
    s = Settings(DATABASE_URL="postgres://user:pass@host:5432/dbname")
    assert s.DATABASE_URL == "postgresql://user:pass@host:5432/dbname"
