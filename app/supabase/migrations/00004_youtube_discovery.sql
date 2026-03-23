-- Migration 00004: YouTube Discovery + Supadata Transcript Support
-- Adds columns for thumbnail, tags, transcript language
-- Updates job_type constraint for new job types

-- ============================================================
-- 1. Add new columns to episodes
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'episodes' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE episodes ADD COLUMN thumbnail_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'episodes' AND column_name = 'youtube_tags'
  ) THEN
    ALTER TABLE episodes ADD COLUMN youtube_tags TEXT[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'episodes' AND column_name = 'transcript_lang'
  ) THEN
    ALTER TABLE episodes ADD COLUMN transcript_lang TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'episodes' AND column_name = 'like_count'
  ) THEN
    ALTER TABLE episodes ADD COLUMN like_count INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'episodes' AND column_name = 'comment_count'
  ) THEN
    ALTER TABLE episodes ADD COLUMN comment_count INTEGER;
  END IF;
END $$;

-- ============================================================
-- 2. Update processing_jobs job_type constraint
-- ============================================================
DO $$
BEGIN
  ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_job_type_check;

  ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_job_type_check
    CHECK (job_type IN (
      'bulk_extract',
      'single_extract',
      'fetch_dates',
      'build_embeddings',
      'inngest_batch',
      'discover_episodes',
      'fetch_transcripts'
    ));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- ============================================================
-- 3. Add youtube_playlist_id to shows
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shows' AND column_name = 'youtube_playlist_id'
  ) THEN
    ALTER TABLE shows ADD COLUMN youtube_playlist_id TEXT;
  END IF;
END $$;
