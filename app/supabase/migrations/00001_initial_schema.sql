-- ============================================================
-- TWITP Initial Schema
-- Creates all tables, indexes, RLS policies, and seed data
-- ============================================================

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Helper: updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Table: shows
-- ============================================================
CREATE TABLE public.shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  host_name TEXT,
  cover_image_url TEXT,
  website_url TEXT,
  youtube_channel_id TEXT,
  transcript_source_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  episode_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shows_slug ON public.shows (slug);

CREATE TRIGGER shows_updated_at
  BEFORE UPDATE ON public.shows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active shows"
  ON public.shows FOR SELECT
  USING (is_active = true);

-- ============================================================
-- Table: episodes
-- ============================================================
CREATE TABLE public.episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  guest_name TEXT,
  description TEXT,
  youtube_url TEXT,
  youtube_video_id TEXT UNIQUE,
  duration_seconds INTEGER,
  duration_display TEXT,
  view_count INTEGER,
  published_at TIMESTAMPTZ,
  published_week DATE,
  transcript_text TEXT,
  summary TEXT,
  ai_model_used TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (show_id, slug)
);

CREATE INDEX idx_episodes_show ON public.episodes (show_id);
CREATE INDEX idx_episodes_published_week ON public.episodes (published_week DESC NULLS LAST);
CREATE INDEX idx_episodes_published_at ON public.episodes (published_at DESC NULLS LAST);
CREATE INDEX idx_episodes_video_id ON public.episodes (youtube_video_id);
CREATE INDEX idx_episodes_status ON public.episodes (processing_status);

CREATE TRIGGER episodes_updated_at
  BEFORE UPDATE ON public.episodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published episodes"
  ON public.episodes FOR SELECT
  USING (is_published = true);

-- ============================================================
-- Table: insights
-- ============================================================
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (episode_id, position)
);

CREATE INDEX idx_insights_episode ON public.insights (episode_id);

-- RLS
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read insights for published episodes"
  ON public.insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.episodes
      WHERE public.episodes.id = public.insights.episode_id
      AND public.episodes.is_published = true
    )
  );

-- ============================================================
-- Table: topics
-- ============================================================
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  episode_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_topics_slug ON public.topics (slug);
CREATE INDEX idx_topics_episode_count ON public.topics (episode_count DESC);

-- RLS
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read all topics"
  ON public.topics FOR SELECT
  USING (true);

-- ============================================================
-- Table: episode_topics (many-to-many)
-- ============================================================
CREATE TABLE public.episode_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  relevance_score FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (episode_id, topic_id)
);

CREATE INDEX idx_episode_topics_episode ON public.episode_topics (episode_id);
CREATE INDEX idx_episode_topics_topic ON public.episode_topics (topic_id);

-- RLS
ALTER TABLE public.episode_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read episode_topics for published episodes"
  ON public.episode_topics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.episodes
      WHERE public.episodes.id = public.episode_topics.episode_id
      AND public.episodes.is_published = true
    )
  );

-- ============================================================
-- Table: prompts
-- ============================================================
CREATE TABLE public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  template TEXT NOT NULL,
  model_provider TEXT NOT NULL DEFAULT 'anthropic'
    CHECK (model_provider IN ('anthropic', 'openai')),
  model_name TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER prompts_updated_at
  BEFORE UPDATE ON public.prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: No public access to prompts (admin-only via service role)
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table: processing_jobs
-- ============================================================
CREATE TABLE public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.shows(id),
  episode_id UUID REFERENCES public.episodes(id),
  job_type TEXT NOT NULL
    CHECK (job_type IN ('bulk_extract', 'single_extract', 'fetch_dates', 'build_embeddings')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_status ON public.processing_jobs (status);
CREATE INDEX idx_processing_jobs_show ON public.processing_jobs (show_id);

-- RLS: No public access (admin-only via service role)
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table: content_embeddings
-- ============================================================
CREATE TABLE public.content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('insight', 'episode_summary')),
  content_id UUID NOT NULL,
  episode_id UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX content_embeddings_embedding_idx
  ON public.content_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_embeddings_episode ON public.content_embeddings (episode_id);
CREATE INDEX idx_embeddings_content ON public.content_embeddings (content_type, content_id);

-- RLS
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read embeddings for published episodes"
  ON public.content_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.episodes
      WHERE public.episodes.id = public.content_embeddings.episode_id
      AND public.episodes.is_published = true
    )
  );

-- ============================================================
-- Seed: Default insights extraction prompt
-- ============================================================
INSERT INTO public.prompts (name, description, template, model_provider, model_name)
VALUES (
  'insights_extraction',
  'Extract key insights, topics, and metadata from a podcast transcript',
  E'You are an expert podcast analyst. Analyze the following podcast transcript and extract structured insights.\n\n**Show:** {show_name}\n**Episode Title:** {episode_title}\n\n**Transcript:**\n{transcript}\n\n**Instructions:**\nReturn a JSON object with exactly this structure:\n\n```json\n{\n  "guest_name": "Full name of the guest (or null if no guest)",\n  "summary": "2-3 sentence summary of the episode''s main theme and key takeaway",\n  "insights": [\n    "First key insight — a specific, actionable or surprising takeaway",\n    "Second key insight",\n    "Third key insight",\n    "Fourth key insight",\n    "Fifth key insight"\n  ],\n  "topics": [\n    "topic-slug-1",\n    "topic-slug-2",\n    "topic-slug-3"\n  ]\n}\n```\n\n**Rules for insights:**\n- Each insight should be 1-2 sentences\n- Focus on actionable advice, surprising data points, or novel frameworks\n- Avoid generic statements — be specific about what was said\n- Include the speaker''s name when quoting or paraphrasing\n\n**Rules for topics:**\n- Use lowercase kebab-case slugs\n- 3-7 topics per episode\n- Prefer established topic names: product-management, growth-strategy, leadership, hiring, product-market-fit, ai, entrepreneurship, fundraising, company-culture, decision-making, etc.\n\nReturn ONLY the JSON object, no other text.',
  'anthropic',
  'claude-sonnet-4-5-20250929'
);
