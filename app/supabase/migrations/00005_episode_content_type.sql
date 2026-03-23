-- Add content_type column to episodes table
-- Values: 'episode' (full episodes), 'short' (< 10 min), 'clip' (manually tagged)
ALTER TABLE episodes
  ADD COLUMN content_type TEXT DEFAULT 'episode'
  CHECK (content_type IN ('episode', 'short', 'clip'));

-- Backfill: tag existing episodes under 10 minutes as shorts
UPDATE episodes
  SET content_type = 'short'
  WHERE duration_seconds IS NOT NULL
    AND duration_seconds < 600;
