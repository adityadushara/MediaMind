-- ==============================================================================
-- Migration: 003_m3_extraction_and_derivatives.sql
-- Description: M3 Multimodal extraction runs, image derivatives, and candidate extensions
-- Target: PostgreSQL 15+ / Supabase PostgreSQL
-- ==============================================================================

-- 1. Create processing_runs table to track AI execution telemetry
CREATE TABLE IF NOT EXISTS processing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
    prompt_identifier VARCHAR(100) NOT NULL DEFAULT 'gemini_multimodal_extraction',
    prompt_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    ai_model_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('processing', 'completed', 'failed')),
    processing_duration_ms INTEGER,
    prompt_tokens INTEGER,
    candidate_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_usd NUMERIC(8, 6),
    region_count INTEGER DEFAULT 0,
    candidate_count INTEGER DEFAULT 0,
    error_category VARCHAR(100),
    error_message TEXT,
    raw_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_runs_user 
    ON processing_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_runs_job 
    ON processing_runs(job_id);

-- 2. Create image_derivatives table for preprocessed images and region crops
CREATE TABLE IF NOT EXISTS image_derivatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
    run_id UUID REFERENCES processing_runs(id) ON DELETE CASCADE,
    derivative_type VARCHAR(50) NOT NULL
        CHECK (derivative_type IN ('preprocessed', 'region_crop', 'thumbnail')),
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    image_width INTEGER NOT NULL,
    image_height INTEGER NOT NULL,
    bounding_box JSONB, -- {"x_min": 100, "y_min": 200, "x_max": 400, "y_max": 600}
    processing_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_derivatives_source 
    ON image_derivatives(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_image_derivatives_user 
    ON image_derivatives(user_id);

-- 3. Extend identification_candidates for rich M3 multimodal extraction
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES processing_runs(id) ON DELETE CASCADE;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS derivative_id UUID REFERENCES image_derivatives(id) ON DELETE SET NULL;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS additional_creators JSONB DEFAULT '[]'::jsonb;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS description_clue TEXT;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS year_clue INTEGER;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS visible_text JSONB DEFAULT '[]'::jsonb;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS identifying_clues JSONB DEFAULT '[]'::jsonb;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS uncertainty_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'needs_review';
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(50);
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS ai_model_name VARCHAR(100);
ALTER TABLE identification_candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_candidates_user_review 
    ON identification_candidates(user_id, review_status);
CREATE INDEX IF NOT EXISTS idx_candidates_job 
    ON identification_candidates(job_id);

-- 4. Enable RLS and define policies for new user-owned tables
ALTER TABLE processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_derivatives ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'processing_runs' AND policyname = 'Users can manage own processing runs'
    ) THEN
        CREATE POLICY "Users can manage own processing runs"
            ON processing_runs FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'image_derivatives' AND policyname = 'Users can manage own image derivatives'
    ) THEN
        CREATE POLICY "Users can manage own image derivatives"
            ON image_derivatives FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
