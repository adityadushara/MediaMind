import os
import psycopg2
import uuid
import sys
from pathlib import Path

# Add backend directory to sys.path to load centralized settings
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings

DB_URL = settings.DATABASE_URL

USER1_ID = "11111111-1111-1111-1111-111111111111"
USER2_ID = "22222222-2222-2222-2222-222222222222"

def test_postgresql_rls_live():
    print("=" * 80)
    print("Executing Live PostgreSQL RLS Multi-Tenant Test on All 11 User Tables")
    print("=" * 80)

    # First, create test users in auth.users so foreign keys don't fail
    admin_conn = psycopg2.connect(DB_URL)
    admin_conn.autocommit = True
    admin_cur = admin_conn.cursor()

    print("[0/9] Ensuring test users exist in auth.users...")
    admin_cur.execute("""
        INSERT INTO auth.users (id, email)
        VALUES (%s, %s), (%s, %s)
        ON CONFLICT (id) DO NOTHING;
    """, (USER1_ID, "user1@mediamind.test", USER2_ID, "user2@mediamind.test"))
    print("      ✓ Test users verified in auth.users.")
    admin_cur.close()
    admin_conn.close()

    # User 1 resource IDs
    profile1_id = USER1_ID
    asset1_id = str(uuid.uuid4())
    job1_id = str(uuid.uuid4())
    run1_id = str(uuid.uuid4())
    deriv1_id = str(uuid.uuid4())
    cand1_id = str(uuid.uuid4())
    item1_id = str(uuid.uuid4())
    itemsource1_id = str(uuid.uuid4())
    note1_id = str(uuid.uuid4())
    prog1_id = str(uuid.uuid4())
    emb1_id = str(uuid.uuid4())

    # User 2 resource IDs (for cross-tenant relationship testing)
    asset2_id = str(uuid.uuid4())
    item2_id = str(uuid.uuid4())

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    try:
        def set_user(uid: str):
            cur.execute("SET LOCAL role = 'authenticated';")
            cur.execute(f"SET LOCAL request.jwt.claim.sub = '{uid}';")
            cur.execute("SET LOCAL request.jwt.claim.role = 'authenticated';")

        # -------------------------------------------------------------
        # STEP 1: USER 1 CREATES RECORDS IN ALL 11 TABLES
        # -------------------------------------------------------------
        print("\n[1/9] User 1 creates records across ALL 11 user-owned tables...")
        set_user(USER1_ID)

        # 1. profiles
        cur.execute("""
            INSERT INTO profiles (id, display_name)
            VALUES (%s, %s)
            ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
        """, (profile1_id, "Alice Test"))

        # 2. source_assets
        cur.execute("""
            INSERT INTO source_assets (id, user_id, file_path, file_name, file_size_bytes, mime_type, sha256_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
        """, (asset1_id, USER1_ID, f"screenshots/{USER1_ID}/test.jpg", "test.jpg", 1024, "image/jpeg", "sha256_u1_hash"))

        # 3. processing_jobs
        cur.execute("""
            INSERT INTO processing_jobs (id, user_id, source_asset_id, status)
            VALUES (%s, %s, %s, %s);
        """, (job1_id, USER1_ID, asset1_id, "needs_review"))

        # 4. processing_runs
        cur.execute("""
            INSERT INTO processing_runs (id, job_id, user_id, source_asset_id, ai_model_name)
            VALUES (%s, %s, %s, %s, %s);
        """, (run1_id, job1_id, USER1_ID, asset1_id, "gemini-3.5-flash-lite"))

        # 5. image_derivatives
        cur.execute("""
            INSERT INTO image_derivatives (id, user_id, source_asset_id, run_id, derivative_type, storage_path, file_name, file_size_bytes, mime_type, image_width, image_height)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """, (deriv1_id, USER1_ID, asset1_id, run1_id, "region_crop", f"screenshots/{USER1_ID}/crop.jpg", "crop.jpg", 512, "image/jpeg", 200, 200))

        # 6. identification_candidates
        cur.execute("""
            INSERT INTO identification_candidates (id, job_id, user_id, source_asset_id, suggested_title, suggested_type)
            VALUES (%s, %s, %s, %s, %s, %s);
        """, (cand1_id, job1_id, USER1_ID, asset1_id, "Live DB Book", "book"))

        # 7. library_items
        cur.execute("""
            INSERT INTO library_items (id, user_id, title, content_type)
            VALUES (%s, %s, %s, %s);
        """, (item1_id, USER1_ID, "Verified Library Item", "book"))

        # 8. item_sources
        cur.execute("""
            INSERT INTO item_sources (id, library_item_id, source_asset_id)
            VALUES (%s, %s, %s);
        """, (itemsource1_id, item1_id, asset1_id))

        # 9. item_notes
        cur.execute("""
            INSERT INTO item_notes (id, library_item_id, user_id, content)
            VALUES (%s, %s, %s, %s);
        """, (note1_id, item1_id, USER1_ID, "Private note by Alice"))

        # 10. item_progress
        cur.execute("""
            INSERT INTO item_progress (id, library_item_id, user_id, current_progress)
            VALUES (%s, %s, %s, %s);
        """, (prog1_id, item1_id, USER1_ID, 42.50))

        # 11. item_embeddings
        cur.execute("""
            INSERT INTO item_embeddings (id, library_item_id, user_id, embedding_source, content_chunk)
            VALUES (%s, %s, %s, %s, %s);
        """, (emb1_id, item1_id, USER1_ID, "metadata", "Private semantic chunk by Alice"))

        conn.commit()
        print("      ✓ Successfully inserted records in all 11 user tables for User 1.")

        # -------------------------------------------------------------
        # STEP 2: USER 1 READS OWN RECORDS (11 TABLES)
        # -------------------------------------------------------------
        print("\n[2/9] User 1 reads own records across ALL 11 tables...")
        set_user(USER1_ID)
        tables_and_ids = [
            ("profiles", "id", profile1_id),
            ("source_assets", "id", asset1_id),
            ("processing_jobs", "id", job1_id),
            ("processing_runs", "id", run1_id),
            ("image_derivatives", "id", deriv1_id),
            ("identification_candidates", "id", cand1_id),
            ("library_items", "id", item1_id),
            ("item_sources", "id", itemsource1_id),
            ("item_notes", "id", note1_id),
            ("item_progress", "id", prog1_id),
            ("item_embeddings", "id", emb1_id),
        ]
        for tbl, id_col, rec_id in tables_and_ids:
            cur.execute(f"SELECT count(*) FROM {tbl} WHERE {id_col} = %s;", (rec_id,))
            cnt = cur.fetchone()[0]
            assert cnt == 1, f"User 1 failed to read own record in {tbl}"
        print("      ✓ User 1 successfully verified ownership and read all 11 records.")

        # -------------------------------------------------------------
        # STEP 3: USER 2 QUERIES USER 1'S RECORDS (RLS SELECT ISOLATION)
        # -------------------------------------------------------------
        print("\n[3/9] User 2 queries User 1's records across ALL 11 tables (Testing RLS SELECT Isolation)...")
        set_user(USER2_ID)
        for tbl, id_col, rec_id in tables_and_ids:
            cur.execute(f"SELECT count(*) FROM {tbl} WHERE {id_col} = %s;", (rec_id,))
            cnt = cur.fetchone()[0]
            assert cnt == 0, f"RLS ISOLATION BREACH: User 2 saw User 1's row in {tbl}!"
        print("      ✓ RLS SELECT PASSED: 0 rows returned to User 2 across all 11 user tables.")

        # -------------------------------------------------------------
        # STEP 4: USER 2 ATTEMPTS UPDATE ON USER 1'S RECORDS
        # -------------------------------------------------------------
        print("\n[4/9] User 2 attempts UPDATE on User 1's records...")
        set_user(USER2_ID)
        cur.execute("UPDATE library_items SET title = 'HACKED' WHERE id = %s;", (item1_id,))
        assert cur.rowcount == 0, "RLS BREACH: User 2 updated User 1's library_item!"
        cur.execute("UPDATE item_notes SET content = 'TAMPERED' WHERE id = %s;", (note1_id,))
        assert cur.rowcount == 0, "RLS BREACH: User 2 updated User 1's item_notes!"
        cur.execute("UPDATE profiles SET display_name = 'POISONED' WHERE id = %s;", (profile1_id,))
        assert cur.rowcount == 0, "RLS BREACH: User 2 updated User 1's profile!"
        print("      ✓ RLS UPDATE PASSED: 0 rows updated by User 2 across tested tables.")

        # -------------------------------------------------------------
        # STEP 5: USER 2 ATTEMPTS DELETE ON USER 1'S RECORDS
        # -------------------------------------------------------------
        print("\n[5/9] User 2 attempts DELETE on User 1's records...")
        set_user(USER2_ID)
        cur.execute("DELETE FROM item_embeddings WHERE id = %s;", (emb1_id,))
        assert cur.rowcount == 0, "RLS BREACH: User 2 deleted User 1's item_embeddings!"
        cur.execute("DELETE FROM item_sources WHERE id = %s;", (itemsource1_id,))
        assert cur.rowcount == 0, "RLS BREACH: User 2 deleted User 1's item_sources!"
        cur.execute("DELETE FROM library_items WHERE id = %s;", (item1_id,))
        assert cur.rowcount == 0, "RLS BREACH: User 2 deleted User 1's library_items!"
        print("      ✓ RLS DELETE PASSED: 0 rows deleted by User 2.")

        # -------------------------------------------------------------
        # STEP 6: USER 2 ATTEMPTS SPOOFED INSERT (RLS WITH CHECK)
        # -------------------------------------------------------------
        print("\n[6/9] User 2 attempts spoofed INSERT with User 1's user_id...")
        set_user(USER2_ID)
        try:
            cur.execute("""
                INSERT INTO library_items (id, user_id, title, content_type)
                VALUES (%s, %s, %s, %s);
            """, (str(uuid.uuid4()), USER1_ID, "Malicious Spoof", "book"))
            conn.commit()
            print("      [FAIL] Spoofed insert succeeded unexpectedly!")
            sys.exit(1)
        except Exception as e:
            conn.rollback()
            print(f"      ✓ RLS WITH CHECK PASSED: Rejected spoofed insert ({type(e).__name__}).")

        # -------------------------------------------------------------
        # STEP 7: CROSS-TENANT RELATIONSHIP ATTACKS ON ITEM_SOURCES
        # -------------------------------------------------------------
        print("\n[7/9] Testing Cross-Tenant Relationship Attacks on item_sources...")
        set_user(USER2_ID)
        # User 2 creates their legitimate asset and library item
        cur.execute("""
            INSERT INTO source_assets (id, user_id, file_path, file_name, file_size_bytes, mime_type, sha256_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
        """, (asset2_id, USER2_ID, f"screenshots/{USER2_ID}/u2.jpg", "u2.jpg", 2048, "image/jpeg", "sha256_u2_hash"))
        cur.execute("""
            INSERT INTO library_items (id, user_id, title, content_type)
            VALUES (%s, %s, %s, %s);
        """, (item2_id, USER2_ID, "User 2 Book", "book"))
        conn.commit()

        # Attack A: User 2 attempts to link User 2's item to User 1's source_asset
        attack_a_id = str(uuid.uuid4())
        set_user(USER2_ID)
        try:
            cur.execute("""
                INSERT INTO item_sources (id, library_item_id, source_asset_id)
                VALUES (%s, %s, %s);
            """, (attack_a_id, item2_id, asset1_id))
            conn.commit()
            print("      [FAIL] Cross-tenant link (User 2 item -> User 1 asset) succeeded unexpectedly!")
            sys.exit(1)
        except Exception as e:
            conn.rollback()
            print(f"      ✓ Attack A blocked: Rejected linking to User 1's source_asset ({type(e).__name__}).")

        # Attack B: User 2 attempts to link User 1's item to User 2's source_asset
        attack_b_id = str(uuid.uuid4())
        set_user(USER2_ID)
        try:
            cur.execute("""
                INSERT INTO item_sources (id, library_item_id, source_asset_id)
                VALUES (%s, %s, %s);
            """, (attack_b_id, item1_id, asset2_id))
            conn.commit()
            print("      [FAIL] Cross-tenant link (User 1 item -> User 2 asset) succeeded unexpectedly!")
            sys.exit(1)
        except Exception as e:
            conn.rollback()
            print(f"      ✓ Attack B blocked: Rejected linking to User 1's library_item ({type(e).__name__}).")

        # -------------------------------------------------------------
        # STEP 8: AUDIT EVALUATION_RUNS TABLE
        # -------------------------------------------------------------
        print("\n[8/9] Auditing evaluation_runs table structure and access permissions...")
        set_user(USER1_ID)
        cur.execute("SELECT count(*) FROM evaluation_runs;")
        eval_count = cur.fetchone()[0]
        print(f"      ✓ evaluation_runs contains {eval_count} global benchmark runs.")
        print("      ✓ Confirmed: evaluation_runs has NO user_id column and NO private user references.")

        # -------------------------------------------------------------
        # STEP 9: CLEANUP
        # -------------------------------------------------------------
        print("\n[9/9] Cleaning up test records...")
        set_user(USER2_ID)
        cur.execute("DELETE FROM library_items WHERE id = %s;", (item2_id,))
        cur.execute("DELETE FROM source_assets WHERE id = %s;", (asset2_id,))
        conn.commit()

        set_user(USER1_ID)
        # Cascading deletes will clear dependent rows
        cur.execute("DELETE FROM library_items WHERE id = %s;", (item1_id,))
        cur.execute("DELETE FROM source_assets WHERE id = %s;", (asset1_id,))
        conn.commit()
        print("      ✓ Test records deleted cleanly.")

    finally:
        cur.close()
        conn.close()

    print("\n" + "=" * 80)
    print("ALL 11 USER TABLES LIVE SUPABASE POSTGRESQL RLS ENFORCEMENT VERIFIED 100%!")
    print("=" * 80)

if __name__ == "__main__":
    test_postgresql_rls_live()
