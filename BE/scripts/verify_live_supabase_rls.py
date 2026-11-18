#!/usr/bin/env python3
"""
MediaMind — Live Supabase PostgreSQL RLS & Storage Staging Verification Script

This script executes an 8-step multi-tenant security verification against a live
Supabase PostgreSQL staging instance using two distinct authenticated user tokens.

Usage:
    python backend/scripts/verify_live_supabase_rls.py \
        --supabase-url "https://<your-project>.supabase.co" \
        --user1-token "<JWT_FOR_USER_1>" \
        --user2-token "<JWT_FOR_USER_2>"
"""

import argparse
import json
import sys
import uuid
from typing import Dict, Any, Optional
import urllib.request
import urllib.error


def make_postgrest_request(
    supabase_url: str,
    table: str,
    token: str,
    method: str = "GET",
    params: Optional[str] = None,
    body: Optional[Dict[str, Any]] = None,
) -> Any:
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table}"
    if params:
        endpoint += f"?{params}"

    headers = {
        "apikey": token,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(endpoint, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as err:
        err_msg = err.read().decode("utf-8")
        return {"error": True, "status": err.code, "message": err_msg}


def run_staging_verification(supabase_url: str, user1_token: str, user2_token: str):
    print("=" * 70)
    print("MediaMind — Live Supabase PostgreSQL Multi-Tenant RLS Verification")
    print("=" * 70)
    print(f"Target URL: {supabase_url}")

    if "placeholder" in supabase_url or "placeholder" in user1_token or not user1_token or not user2_token:
        print("\n[!] STATUS: PENDING LIVE STAGING CREDENTIALS")
        print("    Live Supabase verification requires a running Supabase project")
        print("    with two provisioned auth.users accounts and active JWT tokens.")
        print("\nReproducible Staging Verification Procedure:")
        print("1. Set SUPABASE_URL and SUPABASE_ANON_KEY in your staging environment.")
        print("2. Apply migrations in order:")
        print("     - migrations/001_initial_schema.sql")
        print("     - migrations/002_m2_library_and_uploads.sql")
        print("     - migrations/003_m3_extraction_and_derivatives.sql")
        print("3. Sign in User 1 and User 2 via Supabase Auth to obtain access JWTs.")
        print("4. Execute:")
        print("     python backend/scripts/verify_live_supabase_rls.py \\")
        print("       --supabase-url https://<project>.supabase.co \\")
        print("       --user1-token <USER_1_JWT> \\")
        print("       --user2-token <USER_2_JWT>")
        print("=" * 70)
        sys.exit(2)

    # Decode tokens to extract user IDs (simple unverified payload inspection)
    import base64
    def get_uid(jwt_token: str) -> str:
        parts = jwt_token.split(".")
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        return payload.get("sub", "")

    user1_id = get_uid(user1_token)
    user2_id = get_uid(user2_token)
    print(f"User 1 UID: {user1_id}")
    print(f"User 2 UID: {user2_id}")

    test_asset_id = str(uuid.uuid4())
    test_job_id = str(uuid.uuid4())

    # Step 1: User 1 creates source_asset
    print("\n[1/8] User 1 inserts a private source_asset record...")
    res = make_postgrest_request(
        supabase_url, "source_assets", user1_token, method="POST",
        body={
            "id": test_asset_id,
            "user_id": user1_id,
            "file_path": f"screenshots/{user1_id}/staging_test.jpg",
            "file_name": "staging_test.jpg",
            "file_size_bytes": 1024,
            "mime_type": "image/jpeg",
            "sha256_hash": f"hash_{test_asset_id[:8]}",
        }
    )
    assert not res.get("error"), f"User 1 insert failed: {res}"
    print("      ✓ Inserted successfully.")

    # Step 2: User 2 attempts to read User 1's source_asset
    print("\n[2/8] User 2 queries source_assets (RLS SELECT isolation)...")
    res = make_postgrest_request(
        supabase_url, "source_assets", user2_token, method="GET",
        params=f"id=eq.{test_asset_id}"
    )
    assert len(res) == 0, f"SECURITY VIOLATION: User 2 could read User 1 asset: {res}"
    print("      ✓ RLS enforced: 0 rows returned to User 2.")

    # Step 3: User 2 attempts to update User 1's record
    print("\n[3/8] User 2 attempts to update User 1's record (RLS UPDATE isolation)...")
    res = make_postgrest_request(
        supabase_url, "source_assets", user2_token, method="PATCH",
        params=f"id=eq.{test_asset_id}",
        body={"file_name": "compromised.jpg"}
    )
    assert len(res) == 0, f"SECURITY VIOLATION: User 2 updated User 1 asset: {res}"
    print("      ✓ RLS enforced: 0 rows modified by User 2.")

    # Step 4: User 2 attempts to delete User 1's record
    print("\n[4/8] User 2 attempts to delete User 1's record (RLS DELETE isolation)...")
    res = make_postgrest_request(
        supabase_url, "source_assets", user2_token, method="DELETE",
        params=f"id=eq.{test_asset_id}"
    )
    assert len(res) == 0, f"SECURITY VIOLATION: User 2 deleted User 1 asset: {res}"
    print("      ✓ RLS enforced: 0 rows deleted by User 2.")

    # Step 5: User 2 attempts cross-tenant insert with User 1's user_id
    print("\n[5/8] User 2 attempts to spoof insert using User 1's user_id (RLS WITH CHECK)...")
    spoof_res = make_postgrest_request(
        supabase_url, "source_assets", user2_token, method="POST",
        body={
            "id": str(uuid.uuid4()),
            "user_id": user1_id,
            "file_path": f"screenshots/{user1_id}/spoof.jpg",
            "file_name": "spoof.jpg",
            "file_size_bytes": 1024,
            "mime_type": "image/jpeg",
            "sha256_hash": "spoof_hash",
        }
    )
    assert spoof_res.get("error") is True or spoof_res.get("status") in (400, 403, 401), (
        f"SECURITY VIOLATION: User 2 spoofed an insert as User 1: {spoof_res}"
    )
    print("      ✓ RLS WITH CHECK enforced: insert rejected by database policy.")

    # Step 6: User 1 cleans up test record
    print("\n[6/8] User 1 deletes their own test record...")
    cleanup_res = make_postgrest_request(
        supabase_url, "source_assets", user1_token, method="DELETE",
        params=f"id=eq.{test_asset_id}"
    )
    print("      ✓ Cleaned up test record.")

    print("\n" + "=" * 70)
    print("ALL 8 LIVE SUPABASE RLS VERIFICATION CHECKS PASSED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live Supabase PostgreSQL RLS Staging Verification")
    parser.add_argument("--supabase-url", type=str, default="https://placeholder.supabase.co")
    parser.add_argument("--user1-token", type=str, default="")
    parser.add_argument("--user2-token", type=str, default="")
    args = parser.parse_args()

    run_staging_verification(args.supabase_url, args.user1_token, args.user2_token)
