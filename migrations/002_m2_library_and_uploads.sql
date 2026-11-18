-- ==============================================================================
-- Migration: 002_m2_library_and_uploads.sql
-- Description: Expand content types, job states, idempotency tracking, and worker claiming
-- Target: PostgreSQL 15+ / Supabase PostgreSQL
-- ==============================================================================

-- 1. Update library_items content_type check constraint to include 'other'
ALTER TABLE library_items DROP CONSTRAINT IF EXISTS library_items_content_type_check;
ALTER TABLE library_items ADD CONSTRAINT library_items_content_type_check
    CHECK (content_type IN ('book', 'movie', 'tv_show', 'youtube_video', 'documentary', 'podcast', 'course', 'other'));

-- 2. Update processing_jobs status check constraint for M2 lifecycle
ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_status_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'awaiting_identification', 'completed', 'identified', 'needs_review', 'unidentified', 'failed'));

-- 3. Add idempotency_key to source_assets to prevent duplicate upload jobs
ALTER TABLE source_assets ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_source_assets_user_idempotency 
    ON source_assets(user_id, idempotency_key);

-- 4. Add worker claiming fields to processing_jobs for concurrency control and stale job recovery
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_claimed 
    ON processing_jobs(status, claimed_at);
