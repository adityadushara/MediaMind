-- ==============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Core schema for MediaMind modular monolith
-- Target: PostgreSQL 15+ / Supabase PostgreSQL with pgvector
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Enable vector extension for enterprise RAG (if supported on instance)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'vector extension could not be loaded directly; ensure pgvector is enabled in Supabase extensions dashboard';
END $$;

-- 2. Helper function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. Profiles Table (extends Supabase auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 4. Source Assets Table (Original Screenshots Preservation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS source_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    image_width INTEGER,
    image_height INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_assets_user_sha256 
    ON source_assets(user_id, sha256_hash);
CREATE INDEX IF NOT EXISTS idx_source_assets_user_created 
    ON source_assets(user_id, created_at DESC);

-- ==============================================================================
-- 5. Processing Jobs Table (Async Workflow Automation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'queued' 
        CHECK (status IN ('queued', 'processing', 'identified', 'needs_review', 'unidentified', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    ai_model_name VARCHAR(100),
    prompt_version VARCHAR(50),
    processing_time_ms INTEGER,
    token_usage JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_status 
    ON processing_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue 
    ON processing_jobs(status, created_at ASC);

CREATE TRIGGER set_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 6. Library Items Table (Verified Personal Media Records)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS library_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    creator TEXT,
    content_type VARCHAR(50) NOT NULL 
        CHECK (content_type IN ('book', 'movie', 'tv_show', 'youtube_video', 'documentary', 'podcast', 'course')),
    consumption_status VARCHAR(50) NOT NULL DEFAULT 'want_to_consume'
        CHECK (consumption_status IN ('want_to_consume', 'consuming', 'completed', 'on_hold', 'dropped')),
    release_year INTEGER,
    overview TEXT,
    cover_image_url TEXT,
    external_provider VARCHAR(50),
    external_id TEXT,
    provider_metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    user_rating NUMERIC(3, 1) CHECK (user_rating IS NULL OR (user_rating >= 0.0 AND user_rating <= 10.0)),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'verified'
        CHECK (verification_status IN ('verified', 'manual_entry', 'auto_accepted')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_items_user_type 
    ON library_items(user_id, content_type);
CREATE INDEX IF NOT EXISTS idx_library_items_user_status 
    ON library_items(user_id, consumption_status);
CREATE INDEX IF NOT EXISTS idx_library_items_user_title 
    ON library_items(user_id, title);

CREATE TRIGGER set_library_items_updated_at
    BEFORE UPDATE ON library_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 7. Item Sources Table (Many-to-Many Linking with Visual Evidence Coordinates)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS item_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
    crop_coordinates JSONB, -- {"x": 100, "y": 200, "w": 400, "h": 600}
    detection_confidence NUMERIC(4, 3),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_item_source UNIQUE (library_item_id, source_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_item_sources_library_item 
    ON item_sources(library_item_id);
CREATE INDEX IF NOT EXISTS idx_item_sources_source_asset 
    ON item_sources(source_asset_id);

-- ==============================================================================
-- 8. Identification Candidates Table (Human Review Queue & Candidates)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS identification_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    suggested_title TEXT NOT NULL,
    suggested_creator TEXT,
    suggested_type VARCHAR(50),
    confidence_score NUMERIC(4, 3),
    evidence_text TEXT,
    bounding_box JSONB,
    provider_candidates JSONB DEFAULT '[]'::jsonb NOT NULL,
    resolution_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (resolution_status IN ('pending', 'accepted', 'rejected', 'dismissed')),
    resolved_library_item_id UUID REFERENCES library_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_candidates_user_status 
    ON identification_candidates(user_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_candidates_job 
    ON identification_candidates(job_id);

-- ==============================================================================
-- 9. Item Progress Table (Consumption Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS item_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_progress NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    total_progress NUMERIC(8, 2),
    progress_unit VARCHAR(30) NOT NULL DEFAULT 'percentage'
        CHECK (progress_unit IN ('pages', 'minutes', 'episodes', 'percentage')),
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_item_progress UNIQUE (library_item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_progress_user 
    ON item_progress(user_id);

CREATE TRIGGER set_item_progress_updated_at
    BEFORE UPDATE ON item_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 10. Item Notes Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS item_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_notes_user_item 
    ON item_notes(user_id, library_item_id);

CREATE TRIGGER set_item_notes_updated_at
    BEFORE UPDATE ON item_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 11. Item Embeddings Table (Enterprise RAG)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS item_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_item_id UUID NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    embedding_source VARCHAR(50) NOT NULL 
        CHECK (embedding_source IN ('metadata', 'note', 'overview')),
    embedding vector(768),
    content_chunk TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_embeddings_user 
    ON item_embeddings(user_id);

-- ==============================================================================
-- 12. Evaluation Runs Table (LLM Observability & Benchmark)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_suite VARCHAR(100) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    prompt_version VARCHAR(50) NOT NULL,
    dataset_size INTEGER NOT NULL,
    precision_score NUMERIC(5, 4),
    recall_score NUMERIC(5, 4),
    review_rate NUMERIC(5, 4),
    avg_latency_ms INTEGER,
    total_tokens INTEGER,
    estimated_cost_usd NUMERIC(8, 4),
    details JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- 13. Enable Row Level Security (RLS) on all user-owned tables
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE identification_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_embeddings ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 14. Define RLS Policies (auth.uid() isolation)
-- ==============================================================================
CREATE POLICY "Users can manage own profile"
    ON profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own source assets"
    ON source_assets FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own processing jobs"
    ON processing_jobs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own library items"
    ON library_items FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access own item sources"
    ON item_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM library_items 
            WHERE library_items.id = item_sources.library_item_id 
            AND library_items.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM source_assets
            WHERE source_assets.id = item_sources.source_asset_id
            AND source_assets.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM library_items 
            WHERE library_items.id = item_sources.library_item_id 
            AND library_items.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM source_assets
            WHERE source_assets.id = item_sources.source_asset_id
            AND source_assets.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own identification candidates"
    ON identification_candidates FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own item progress"
    ON item_progress FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own item notes"
    ON item_notes FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own item embeddings"
    ON item_embeddings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
