-- deeptrend: Initial schema
-- Run this in your Supabase SQL editor

-- Enable pgvector extension
create extension if not exists vector;

-- Raw signals from all sources
create table if not exists raw_signals (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  title text not null default '',
  content text not null default '',
  url text not null default '',
  author text not null default '',
  author_type text not null default 'human',
  score int not null default 0,
  tags text[] not null default '{}',
  scraped_at timestamptz not null default now(),
  published_at timestamptz,

  constraint raw_signals_source_check check (source in ('google-trends', 'reddit', 'arxiv', 'moltbook')),
  constraint raw_signals_author_type_check check (author_type in ('human', 'agent')),
  constraint raw_signals_unique_source unique (source, source_id)
);

-- Indexes for common queries
create index if not exists idx_raw_signals_source on raw_signals (source);
create index if not exists idx_raw_signals_scraped_at on raw_signals (scraped_at desc);
create index if not exists idx_raw_signals_author_type on raw_signals (author_type);

-- Insights from analysis
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  insight_type text not null,
  topic text not null,
  summary text not null,
  sources jsonb not null default '[]',
  confidence float not null default 0,
  embedding vector(1536),
  analyzed_at timestamptz not null default now(),

  constraint insights_type_check check (insight_type in ('trend', 'consensus', 'divergence', 'tool_mention')),
  constraint insights_confidence_check check (confidence >= 0 and confidence <= 1)
);

-- Indexes for insights
create index if not exists idx_insights_type on insights (insight_type);
create index if not exists idx_insights_analyzed_at on insights (analyzed_at desc);
create index if not exists idx_insights_topic on insights (topic);

-- pgvector index for semantic search (IVFFlat — good for < 1M rows)
create index if not exists idx_insights_embedding on insights
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Row-level security (allow anon key to read/write)
alter table raw_signals enable row level security;
alter table insights enable row level security;

create policy "Allow all for anon" on raw_signals for all using (true) with check (true);
create policy "Allow all for anon" on insights for all using (true) with check (true);
