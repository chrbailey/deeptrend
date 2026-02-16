-- deeptrend V3: Add curated RSS feed sources, convergence fields
-- Run this in your Supabase SQL editor after 002_twitter_velocity.sql

-- Expand source CHECK constraint to include all 13 curated feed sources
ALTER TABLE raw_signals DROP CONSTRAINT raw_signals_source_check;
ALTER TABLE raw_signals ADD CONSTRAINT raw_signals_source_check
  CHECK (source IN (
    -- V1 sources
    'google-trends', 'reddit', 'arxiv', 'moltbook',
    -- V2 source
    'twitter',
    -- V3 curated feeds
    'techmeme', 'hn-digest', 'simon-willison', 'import-ai',
    'alphasignal', 'last-week-ai', 'ahead-of-ai', 'marktechpost',
    'github-trending', 'hf-papers', 'openai-news', 'google-research', 'bair'
  ));

-- Expand insight_type CHECK to include 'gap' (detected missing coverage)
ALTER TABLE insights DROP CONSTRAINT insights_type_check;
ALTER TABLE insights ADD CONSTRAINT insights_type_check
  CHECK (insight_type IN ('trend', 'consensus', 'divergence', 'tool_mention', 'gap'));

-- Convergence tiers on insights (which trust tiers contributed)
ALTER TABLE insights ADD COLUMN IF NOT EXISTS convergence_tiers text[] DEFAULT '{}';
