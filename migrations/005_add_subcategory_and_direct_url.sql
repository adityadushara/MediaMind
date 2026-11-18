-- ==============================================================================
-- Migration: 005_add_subcategory_and_direct_url.sql
-- Description: Add subcategory and direct_url to library_items and identification_candidates
-- Target: PostgreSQL 15+ / Supabase PostgreSQL
-- ==============================================================================

-- 1. Add subcategory and direct_url to library_items
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS direct_url TEXT;

CREATE INDEX IF NOT EXISTS idx_library_items_user_subcategory 
    ON library_items(user_id, subcategory);

-- 2. Add suggested_subcategory and direct_url to identification_candidates
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS suggested_subcategory VARCHAR(100);
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS direct_url TEXT;

CREATE INDEX IF NOT EXISTS idx_identification_candidates_subcategory 
    ON identification_candidates(user_id, suggested_subcategory);
