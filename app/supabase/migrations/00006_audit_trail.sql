-- Migration 00006: Processing Audit Trail + Cost Tracking

CREATE TABLE IF NOT EXISTS processing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'processing_started', 'processing_completed', 'processing_failed',
    'processing_skipped', 'processing_cancelled',
    'retry_requested', 'ai_call_completed', 'ai_call_failed'
  )),
  model_provider TEXT,
  model_name TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_estimate NUMERIC(10, 6),
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_episode ON processing_audit_log (episode_id);
CREATE INDEX idx_audit_job ON processing_audit_log (job_id);
CREATE INDEX idx_audit_type ON processing_audit_log (event_type);
CREATE INDEX idx_audit_created ON processing_audit_log (created_at DESC);

ALTER TABLE processing_audit_log ENABLE ROW LEVEL SECURITY;

-- Denormalized cost columns on episodes
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS processing_cost NUMERIC(10, 6);
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER;

-- Aggregated cost columns on processing_jobs
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS total_input_tokens INTEGER DEFAULT 0;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS total_output_tokens INTEGER DEFAULT 0;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10, 6) DEFAULT 0;
