-- ==============================================================================
-- Migration: 006_m4_metadata_and_deduplication.sql
-- Description: Extended Metadata Columns & Deduplication Indexes for Milestone M4
-- Target: PostgreSQL 15+ / Supabase PostgreSQL / SQLite compatible
-- ==============================================================================

-- 1. Add canonical metadata columns to library_items
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS original_title TEXT;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS isbn VARCHAR(20);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS genre VARCHAR(100);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS runtime_minutes INTEGER;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS language VARCHAR(10);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS publisher VARCHAR(200);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS total_seasons INTEGER;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS total_episodes INTEGER;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Indexes for fast filtering and deduplication
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_items_user_provider_ext_id
    ON library_items(user_id, external_provider, external_id)
    WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_library_items_isbn
    ON library_items(user_id, isbn)
    WHERE isbn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_library_items_genre
    ON library_items(user_id, genre)
    WHERE genre IS NOT NULL;
