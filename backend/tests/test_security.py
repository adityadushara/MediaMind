from app.core.security import parse_jwt_claims_unverified
import pytest
import base64
import json


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


def test_parse_jwt_unverified():
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": "user-abc-123", "email": "test@example.com"}).encode()).decode().rstrip("=")
    dummy_jwt = f"{header}.{payload}.signature"

    claims = parse_jwt_claims_unverified(dummy_jwt)
    assert claims["sub"] == "user-abc-123"
    assert claims["email"] == "test@example.com"
