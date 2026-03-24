-- Migration 00007: Episode Versions (versioned AI content per prompt)
-- Supports multiple AI-generated content versions per episode, tagged by prompt

-- ============================================================
-- 1. episode_versions table
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  guest_name TEXT,
  summary TEXT,
  insights JSONB NOT NULL DEFAULT '[]',
  topics JSONB NOT NULL DEFAULT '[]',
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  processing_cost NUMERIC(10,6),
  processing_duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id, prompt_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_episode_versions_episode_id ON episode_versions(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_versions_prompt_id ON episode_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_episode_versions_status ON episode_versions(status);

-- RLS
ALTER TABLE episode_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Add is_promoted to prompts
-- ============================================================
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false;

-- Mark the current active prompt as promoted
UPDATE prompts SET is_promoted = true WHERE is_active = true;

-- ============================================================
-- 3. Backfill existing data into episode_versions
-- ============================================================
INSERT INTO episode_versions (
  episode_id, prompt_id, guest_name, summary, insights, topics,
  model_provider, model_name, input_tokens, output_tokens,
  processing_cost, processing_duration_ms, status
)
SELECT
  e.id,
  p.id,
  e.guest_name,
  e.summary,
  COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object('position', i.position, 'content', i.content)
      ORDER BY i.position
    ) FROM insights i WHERE i.episode_id = e.id),
    '[]'::jsonb
  ),
  COALESCE(
    (SELECT jsonb_agg(t.slug)
     FROM episode_topics et
     JOIN topics t ON t.id = et.topic_id
     WHERE et.episode_id = e.id),
    '[]'::jsonb
  ),
  COALESCE(split_part(e.ai_model_used, '/', 1), 'anthropic'),
  COALESCE(split_part(e.ai_model_used, '/', 2), 'unknown'),
  e.input_tokens,
  e.output_tokens,
  e.processing_cost,
  e.processing_duration_ms,
  'completed'
FROM episodes e
CROSS JOIN prompts p
WHERE p.is_active = true
AND e.processing_status = 'completed'
AND e.summary IS NOT NULL
ON CONFLICT (episode_id, prompt_id) DO NOTHING;
