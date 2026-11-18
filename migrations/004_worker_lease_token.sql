-- Migration 004: Worker Lease Token & Concurrency Control
-- Adds unique lease_token column to processing_jobs to enforce lease ownership across worker lifecycles.

ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS lease_token VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_lease 
    ON processing_jobs(id, lease_token);
