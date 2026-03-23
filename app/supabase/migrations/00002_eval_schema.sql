-- ============================================================
-- TWITP Eval Schema
-- Tables for prompt evaluation and comparison
-- ============================================================

-- Drop unique constraint on prompts.name to allow variants
ALTER TABLE public.prompts DROP CONSTRAINT IF EXISTS prompts_name_key;

-- ============================================================
-- Table: eval_runs
-- Tracks each evaluation run (one prompt × N episodes)
-- ============================================================
CREATE TABLE public.eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  prompt_id UUID NOT NULL REFERENCES public.prompts(id),
  prompt_template TEXT NOT NULL,
  model_provider TEXT NOT NULL CHECK (model_provider IN ('anthropic', 'openai')),
  model_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  episode_ids UUID[] NOT NULL,
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eval_runs_status ON public.eval_runs (status);
CREATE INDEX idx_eval_runs_prompt ON public.eval_runs (prompt_id);
CREATE INDEX idx_eval_runs_created ON public.eval_runs (created_at DESC);

ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table: eval_results
-- Stores AI output per episode per eval run (isolated from production)
-- ============================================================
CREATE TABLE public.eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id UUID NOT NULL REFERENCES public.eval_runs(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  guest_name TEXT,
  summary TEXT,
  insights JSONB,
  topics JSONB,
  raw_response TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (eval_run_id, episode_id)
);

CREATE INDEX idx_eval_results_run ON public.eval_results (eval_run_id);
CREATE INDEX idx_eval_results_episode ON public.eval_results (episode_id);

ALTER TABLE public.eval_results ENABLE ROW LEVEL SECURITY;
