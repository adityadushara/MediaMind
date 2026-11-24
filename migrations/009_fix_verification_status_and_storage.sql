-- 009_fix_verification_status_and_storage.sql
--
-- Problem
-- -------
-- `library_items.verification_status` was created in migration 001 with:
--     CHECK (verification_status IN ('verified', 'manual_entry', 'auto_accepted'))
--
-- The Next.js processing worker stores 'needs_review' for AI results that
-- require human verification. PostgreSQL rejected the whole UPDATE, which
-- silently left the placeholder item ("AI is analyzing screenshot details...")
-- without the identified title, metadata or direct link.
--
-- This migration aligns the database constraint with the application states.

ALTER TABLE library_items
    DROP CONSTRAINT IF EXISTS library_items_verification_status_check;

ALTER TABLE library_items
    ADD CONSTRAINT library_items_verification_status_check
    CHECK (
        verification_status IN (
            'verified',
            'manual_entry',
            'auto_accepted',
            'needs_review',
            'unverified'
        )
    );

-- Make sure every AI-populated item that awaits review is queryable.
CREATE INDEX IF NOT EXISTS idx_library_items_user_verification
    ON library_items(user_id, verification_status);

-- The private storage bucket is normally created from the Supabase dashboard
-- or automatically by the app when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Creating it here keeps fresh environments reproducible. `storage.buckets`
-- exists on hosted Supabase; guard so local SQLite/plain Postgres runs skip it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit)
        VALUES ('screenshots', 'screenshots', false, 15728640)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END
$$;
