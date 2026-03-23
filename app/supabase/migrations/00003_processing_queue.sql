-- Migration 00003: Processing Config + Job Queue Enhancements
-- Supports Phase 7A: Inngest Integration

-- ============================================================
-- 1. Processing Config table (key-value config store)
-- ============================================================
CREATE TABLE IF NOT EXISTS processing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: admin-only via service role
ALTER TABLE processing_config ENABLE ROW LEVEL SECURITY;

-- Seed default config values
INSERT INTO processing_config (key, value) VALUES
  ('concurrency_limit', '3'::jsonb),
  ('default_model_provider', '"anthropic"'::jsonb),
  ('default_model_name', '"claude-sonnet-4-5-20250929"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. Add columns to processing_jobs for Inngest tracking
-- ============================================================
DO $$
BEGIN
  -- Add inngest_event_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'processing_jobs' AND column_name = 'inngest_event_id'
  ) THEN
    ALTER TABLE processing_jobs ADD COLUMN inngest_event_id TEXT;
  END IF;

  -- Add config_snapshot column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'processing_jobs' AND column_name = 'config_snapshot'
  ) THEN
    ALTER TABLE processing_jobs ADD COLUMN config_snapshot JSONB;
  END IF;

  -- Add concurrency_used column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'processing_jobs' AND column_name = 'concurrency_used'
  ) THEN
    ALTER TABLE processing_jobs ADD COLUMN concurrency_used INTEGER;
  END IF;
END $$;

-- ============================================================
-- 3. Update job_type CHECK constraint to include inngest_batch
-- ============================================================
-- Drop and recreate the constraint to add the new value
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_job_type_check;

  -- Add updated constraint
  ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_job_type_check
    CHECK (job_type IN ('bulk_extract', 'single_extract', 'fetch_dates', 'build_embeddings', 'inngest_batch'));
EXCEPTION
  WHEN others THEN
    -- Constraint may not exist, that's fine
    NULL;
END $$;
