import os
import psycopg2
import sys
from pathlib import Path

# Add backend directory to sys.path to load centralized settings
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings

DB_URL = settings.DATABASE_URL

MIGRATION_FILES = [
    "migrations/001_initial_schema.sql",
    "migrations/002_m2_library_and_uploads.sql",
    "migrations/003_m3_extraction_and_derivatives.sql",
    "migrations/004_worker_lease_token.sql",
    "migrations/005_add_subcategory_and_direct_url.sql",
    "migrations/006_m4_metadata_and_deduplication.sql",
]

def apply_migrations():
    print(f"Connecting to Supabase PostgreSQL...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    for mig_path in MIGRATION_FILES:
        p = Path(mig_path)
        if not p.exists():
            # Try from parent directory
            p = Path("..") / mig_path
        if not p.exists():
            print(f"Error: Migration file not found: {mig_path}")
            sys.exit(1)

        print(f"\n---> Applying migration: {p.name}...")
        sql = p.read_text(encoding="utf-8")
        try:
            cur.execute(sql)
            print(f"     [SUCCESS] Applied {p.name}")
        except Exception as e:
            if "already exists" in str(e):
                print(f"     [INFO] Objects in {p.name} already exist ({e}). Continuing...")
            else:
                print(f"     [ERROR] Failed to apply {p.name}: {e}")
                cur.close()
                conn.close()
                sys.exit(1)

    cur.close()
    conn.close()
    print("\nAll migrations applied successfully to Supabase PostgreSQL!")

if __name__ == "__main__":
    apply_migrations()
