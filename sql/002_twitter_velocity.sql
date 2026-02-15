-- deeptrend V2: Add Twitter source, velocity scoring, priority tiers
-- Run this in your Supabase SQL editor after 001_init.sql

-- Expand source CHECK constraint to include 'twitter'
ALTER TABLE raw_signals DROP CONSTRAINT raw_signals_source_check;
ALTER TABLE raw_signals ADD CONSTRAINT raw_signals_source_check
  CHECK (source IN ('google-trends', 'reddit', 'arxiv', 'moltbook', 'twitter'));

-- Velocity column on raw signals (computed post-scrape)
ALTER TABLE raw_signals ADD COLUMN IF NOT EXISTS velocity float DEFAULT 0;

-- Priority tier on insights
ALTER TABLE insights ADD COLUMN IF NOT EXISTS priority text DEFAULT 'p2'
  CHECK (priority IN ('p0', 'p1', 'p2'));
