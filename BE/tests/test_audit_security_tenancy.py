import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.entities import (
    SourceAsset,
    ProcessingJob,
    IdentificationCandidate,
    ImageDerivative,
    ProcessingRun,
)
from app.core.security import AuthenticatedUser, get_current_user
from app.main import app


USER_A_ID = "11111111-1111-1111-1111-111111111111"
USER_B_ID = "22222222-2222-2222-2222-222222222222"


def as_user(user_id: str):
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user_id=user_id,
        email=f"{user_id}@mediamind.test",
        role="authenticated",
    )


def test_cross_tenant_candidate_isolation(db_session: Session, client: TestClient):
    """
    Verifies that User B cannot see, access, modify, or accept User A's candidates.
    """
    asset_a = SourceAsset(
        id=str(uuid.uuid4()),
        user_id=USER_A_ID,
        file_path=f"screenshots/{USER_A_ID}/source_a.jpg",
        file_name="source_a.jpg",
        file_size_bytes=1000,
        mime_type="image/jpeg",
        sha256_hash="hash_a",
    )
    job_a = ProcessingJob(
        id=str(uuid.uuid4()),
        user_id=USER_A_ID,
        source_asset_id=asset_a.id,
        status="needs_review",
    )
    cand_a = IdentificationCandidate(
        id=str(uuid.uuid4()),
        job_id=job_a.id,
        user_id=USER_A_ID,
        source_asset_id=asset_a.id,
        suggested_title="User A Private Book",
        suggested_creator="Author A",
        suggested_type="book",
        confidence_score=0.95,
        review_status="needs_review",
    )
    db_session.add_all([asset_a, job_a, cand_a])
    db_session.commit()

    # 1. User A lists candidates -> sees cand_a
    as_user(USER_A_ID)
    res_a = client.get("/api/v1/reviews/candidates")
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["total"] == 1
    assert data_a["items"][0]["id"] == cand_a.id

    # 2. User B lists candidates -> empty (cannot see User A's candidate)
    as_user(USER_B_ID)
    res_b = client.get("/api/v1/reviews/candidates")
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["total"] == 0

    # 3. User B attempts direct GET of User A's candidate -> 404
    res_b_get = client.get(f"/api/v1/reviews/candidates/{cand_a.id}")
    assert res_b_get.status_code == 404

    # 4. User B attempts to PATCH User A's candidate -> 404
    res_b_patch = client.patch(
        f"/api/v1/reviews/candidates/{cand_a.id}",
        json={"suggested_title": "Hacked Title"},
    )
    assert res_b_patch.status_code == 404

    # 5. User B attempts to accept User A's candidate -> 404
    res_b_accept = client.post(
        f"/api/v1/reviews/candidates/{cand_a.id}/accept",
        json={"consumption_status": "want_to_consume"},
    )
    assert res_b_accept.status_code == 404

    # 6. User B attempts to reject User A's candidate -> 404
    res_b_reject = client.post(
        f"/api/v1/reviews/candidates/{cand_a.id}/reject",
        json={"reason": "not_media"},
    )
    assert res_b_reject.status_code == 404

    # Clean up override
    app.dependency_overrides.pop(get_current_user, None)


def test_cross_tenant_media_download_forbidden(client: TestClient):
    """
    Verifies that User B cannot download User A's screenshot or derivative crop.
    """
    as_user(USER_B_ID)
    # Direct access to User A's files by User B must yield 403 Forbidden
    res = client.get(f"/api/v1/assets/media/screenshots/{USER_A_ID}/private_screenshot.jpg")
    assert res.status_code == 403
    assert "Access forbidden" in res.json()["detail"]
    app.dependency_overrides.pop(get_current_user, None)


def test_directory_traversal_attack_rejected(client: TestClient):
    """
    Verifies that a directory traversal attack attempting to bypass the user prefix check
    via '..' or path escaping is blocked.
    """
    as_user(USER_B_ID)
    traversal_path = f"screenshots/{USER_B_ID}/../../{USER_A_ID}/secret.jpg"
    res = client.get(f"/api/v1/assets/media/{traversal_path}")
    assert res.status_code == 403
    assert "Access forbidden" in res.json()["detail"]
    app.dependency_overrides.pop(get_current_user, None)


def test_encoded_and_backslash_traversal_attack_rejected(client: TestClient):
    """
    Verifies that URL-encoded (%2e%2e%2f) and Windows backslash (..\\) directory traversals are blocked.
    """
    as_user(USER_B_ID)

    # 1. URL-encoded traversal
    encoded_path = f"screenshots/{USER_B_ID}/%2e%2e/%2e%2e/{USER_A_ID}/secret.jpg"
    res1 = client.get(f"/api/v1/assets/media/{encoded_path}")
    assert res1.status_code in (403, 404)

    # 2. Backslash traversal
    backslash_path = f"screenshots/{USER_B_ID}/..\\..\\{USER_A_ID}/secret.jpg"
    res2 = client.get(f"/api/v1/assets/media/{backslash_path}")
    assert res2.status_code in (403, 404)

    app.dependency_overrides.pop(get_current_user, None)


def test_unregistered_file_access_rejected_by_db_ownership(db_session: Session, client: TestClient, tmp_path):
    """
    Verifies that even if an arbitrary file exists on disk within the user's directory,
    it cannot be served unless verified as a registered database record owned by the user.
    """
    # Create an arbitrary unregistered file on disk in user's directory
    from app.core.config import settings
    from pathlib import Path
    storage_root = Path(settings.LOCAL_STORAGE_PATH).resolve()
    user_dir = storage_root / "screenshots" / USER_A_ID
    user_dir.mkdir(parents=True, exist_ok=True)
    unregistered_file = user_dir / "unregistered_probe.jpg"
    unregistered_file.write_bytes(b"probe_bytes")

    as_user(USER_A_ID)
    # Requesting the unregistered file must be denied by database ownership check
    res = client.get(f"/api/v1/assets/media/screenshots/{USER_A_ID}/unregistered_probe.jpg")
    assert res.status_code == 403
    assert "not a registered asset" in res.json()["detail"]

    # Now register it in database as SourceAsset
    asset = SourceAsset(
        id=str(uuid.uuid4()),
        user_id=USER_A_ID,
        file_path=f"screenshots/{USER_A_ID}/unregistered_probe.jpg",
        file_name="unregistered_probe.jpg",
        file_size_bytes=len(b"probe_bytes"),
        mime_type="image/jpeg",
        sha256_hash="probe_hash",
    )
    db_session.add(asset)
    db_session.commit()

    # Now access succeeds!
    res_registered = client.get(f"/api/v1/assets/media/screenshots/{USER_A_ID}/unregistered_probe.jpg")
    assert res_registered.status_code == 200
    assert res_registered.content == b"probe_bytes"

    # User B still cannot access it
    as_user(USER_B_ID)
    res_b = client.get(f"/api/v1/assets/media/screenshots/{USER_A_ID}/unregistered_probe.jpg")
    assert res_b.status_code == 403

    app.dependency_overrides.pop(get_current_user, None)


def test_id_based_asset_file_download_isolation(db_session: Session, client: TestClient):
    """
    Verifies that ID-based endpoints (/api/v1/assets/{id}/file) enforce strict user isolation.
    """
    from app.core.config import settings
    from pathlib import Path
    storage_root = Path(settings.LOCAL_STORAGE_PATH).resolve()
    user_dir = storage_root / "screenshots" / USER_A_ID
    user_dir.mkdir(parents=True, exist_ok=True)
    fpath = user_dir / "id_test.jpg"
    fpath.write_bytes(b"id_test_bytes")

    asset = SourceAsset(
        id=str(uuid.uuid4()),
        user_id=USER_A_ID,
        file_path=f"screenshots/{USER_A_ID}/id_test.jpg",
        file_name="id_test.jpg",
        file_size_bytes=len(b"id_test_bytes"),
        mime_type="image/jpeg",
        sha256_hash="id_test_hash",
    )
    db_session.add(asset)
    db_session.commit()

    # User A downloads by ID -> 200
    as_user(USER_A_ID)
    res_a = client.get(f"/api/v1/assets/{asset.id}/file")
    assert res_a.status_code == 200
    assert res_a.content == b"id_test_bytes"

    # User B requests User A's asset by ID -> 404
    as_user(USER_B_ID)
    res_b = client.get(f"/api/v1/assets/{asset.id}/file")
    assert res_b.status_code == 404

    app.dependency_overrides.pop(get_current_user, None)


def test_double_encoded_traversal_attack_rejected(client: TestClient):
    """
    Verifies that double-encoded (%252e%252e%252f) directory traversal attacks are blocked.
    """
    as_user(USER_B_ID)
    double_encoded_path = f"screenshots/{USER_B_ID}/%252e%252e/%252e%252e/{USER_A_ID}/secret.jpg"
    res = client.get(f"/api/v1/assets/media/{double_encoded_path}")
    assert res.status_code in (403, 404)
    app.dependency_overrides.pop(get_current_user, None)


def test_absolute_path_traversal_rejected(client: TestClient):
    """
    Verifies that absolute path requests attempting to bypass user isolation are blocked.
    """
    as_user(USER_B_ID)
    # Absolute path attempts
    res1 = client.get("/api/v1/assets/media//etc/passwd")
    assert res1.status_code in (403, 404)

    res2 = client.get("/api/v1/assets/media/C:/Windows/System32/drivers/etc/hosts")
    assert res2.status_code in (403, 404)

    app.dependency_overrides.pop(get_current_user, None)


def test_symlink_pointing_outside_storage_rejected(db_session: Session, client: TestClient, tmp_path):
    """
    Verifies that a symlink placed inside user directory that points outside
    the user's storage boundary is strictly rejected.
    """
    import os
    from app.core.config import settings
    from pathlib import Path

    storage_root = Path(settings.LOCAL_STORAGE_PATH).resolve()
    user_dir = storage_root / "screenshots" / USER_A_ID
    user_dir.mkdir(parents=True, exist_ok=True)

    # Outside secret file
    secret_outside = storage_root / "secret_system_file.txt"
    secret_outside.write_bytes(b"SUPER_SECRET_HOST_DATA")

    symlink_file = user_dir / "symlink_escape.jpg"
    try:
        if symlink_file.exists() or symlink_file.is_symlink():
            symlink_file.unlink()
        os.symlink(secret_outside, symlink_file)
    except (OSError, NotImplementedError):
        # On Windows without developer mode/admin privilege, creating symlink can raise OSError
        pytest.skip("Symlink creation not permitted by OS environment privileges")

    # Register as fake asset pointing to symlink
    asset = SourceAsset(
        id=str(uuid.uuid4()),
        user_id=USER_A_ID,
        file_path=f"screenshots/{USER_A_ID}/symlink_escape.jpg",
        file_name="symlink_escape.jpg",
        file_size_bytes=len(b"SUPER_SECRET_HOST_DATA"),
        mime_type="image/jpeg",
        sha256_hash="symlink_hash",
    )
    db_session.add(asset)
    db_session.commit()

    as_user(USER_A_ID)
    res = client.get(f"/api/v1/assets/media/screenshots/{USER_A_ID}/symlink_escape.jpg")
    # Must be 403 Forbidden because symlink points outside user storage root!
    assert res.status_code == 403
    assert "Access forbidden" in res.json()["detail"]

    app.dependency_overrides.pop(get_current_user, None)
    if symlink_file.exists() or symlink_file.is_symlink():
        symlink_file.unlink()


def test_derivative_id_download_isolation(db_session: Session, client: TestClient):
    """
    Verifies that ID-based derivative crop downloads enforce strict user ownership.
    User B cannot download User A's derivative by ID.
    """
    from app.core.config import settings
    from pathlib import Path

    storage_root = Path(settings.LOCAL_STORAGE_PATH).resolve()
    deriv_dir = storage_root / "screenshots" / USER_A_ID / "derivatives"
    deriv_dir.mkdir(parents=True, exist_ok=True)
    fpath = deriv_dir / "deriv_crop.jpg"
    fpath.write_bytes(b"deriv_crop_bytes")

    deriv = ImageDerivative(
        id=str(uuid.uuid4()),
        user_id=USER_A_ID,
        source_asset_id=str(uuid.uuid4()),
        run_id=str(uuid.uuid4()),
        derivative_type="region_crop",
        storage_path=f"screenshots/{USER_A_ID}/derivatives/deriv_crop.jpg",
        file_name="deriv_crop.jpg",
        file_size_bytes=len(b"deriv_crop_bytes"),
        mime_type="image/jpeg",
        image_width=100,
        image_height=100,
    )
    db_session.add(deriv)
    db_session.commit()

    # User A downloads by ID -> 200
    as_user(USER_A_ID)
    res_a = client.get(f"/api/v1/assets/derivatives/{deriv.id}/file")
    assert res_a.status_code == 200
    assert res_a.content == b"deriv_crop_bytes"

    # User B attempts to download User A's derivative by ID -> 404
    as_user(USER_B_ID)
    res_b = client.get(f"/api/v1/assets/derivatives/{deriv.id}/file")
    assert res_b.status_code == 404

    app.dependency_overrides.pop(get_current_user, None)
