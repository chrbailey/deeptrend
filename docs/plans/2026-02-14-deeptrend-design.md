# deeptrend — Design Document

**Date:** 2026-02-14
**Status:** Approved

## Overview

deeptrend is a trend intelligence pipeline that scrapes 4 sources (Google Trends, Reddit, arXiv, Moltbook), stores raw signals in Supabase, and uses `claude -p` (Max subscription) for cross-source analysis.

## Architecture

```
Scrapers (TypeScript, no LLM)           launchd every 15 min
├── google-trends.ts
├── reddit.ts
├── arxiv.ts
└── moltbook.ts
        │
        ▼
Supabase: raw_signals table
        │
Analyzer (claude -p via Max)            launchd 4x/day
├── reads raw_signals since last run
├── cross-references across sources
├── detects: trends, consensus, divergence, tools
        │
        ▼
Supabase: insights table (+ pgvector embeddings)

CLI (on-demand)
└── deeptrend research "topic"
    → targeted scrape + claude -p deep dive
```

## Modes

- `--scrape-only` — mechanical data collection, no LLM tokens
- `--analyze` — reads raw data, pipes to `claude -p`, writes insights
- `--research "topic"` — on-demand: targeted scrape + analyze in one shot

## Data Model

### raw_signals

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK (gen_random_uuid()) |
| source | text | google-trends, reddit, arxiv, moltbook |
| source_id | text | Dedup key (URL, post ID, paper ID) |
| title | text | Headline/title |
| content | text | Body text, abstract, comment |
| url | text | Source URL |
| author | text | Username, author name, or agent ID |
| author_type | text | human or agent |
| score | int | Upvotes, citations, trend score |
| tags | text[] | Keywords, subreddits, categories |
| scraped_at | timestamptz | When we collected it (default now()) |
| published_at | timestamptz | When the source published it |

Unique constraint on `(source, source_id)` for idempotent upserts.

### insights

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK (gen_random_uuid()) |
| insight_type | text | trend, consensus, divergence, tool_mention |
| topic | text | Detected topic/theme |
| summary | text | Claude's synthesis |
| sources | jsonb | Array of raw_signals IDs as evidence |
| confidence | float | 0-1, signal strength |
| embedding | vector(1536) | pgvector for semantic search |
| analyzed_at | timestamptz | When analysis ran (default now()) |

## Sources

### Google Trends
- RSS feed: `https://trends.google.com/trends/trendingsearches/daily/rss?geo=US`
- No auth required, XML response
- Captures: trending searches with approximate traffic numbers

### Reddit
- Public JSON: append `.json` to any subreddit URL
- Subreddits: r/MachineLearning, r/artificial, r/LocalLLaMA, r/OpenAI, r/singularity
- User-Agent header required, no auth for public reads
- author_type: always "human"

### arXiv
- API: `http://export.arxiv.org/api/query?search_query=...`
- Categories: cs.AI, cs.CL, cs.LG, cs.MA (multi-agent)
- XML response, no auth
- author_type: always "human"

### Moltbook
- OpenClaw agent forum — 1.5M+ agents
- Scraping approach TBD (research in progress)
- author_type: always "agent" (this is the key differentiator)

## Analysis Prompt Strategy

The analyzer builds a prompt containing:
1. Raw signals grouped by source since last analysis
2. Previous insights for continuity
3. Specific asks: emerging trends, agent consensus, agent-vs-human divergence, new tool mentions

Output format: structured JSON array of insights, parsed and stored.

## Scheduling (launchd)

- `com.deeptrend.scrape` — every 15 minutes, `--scrape-only`
- `com.deeptrend.analyze` — 4x/day (6am, 12pm, 6pm, 12am), `--analyze`

## Stack

- TypeScript, Node.js 20+
- @supabase/supabase-js
- fast-xml-parser (arXiv + Google Trends RSS)
- commander (CLI)
- vitest (tests)
- dotenv
- tsx (TypeScript execution)

## Decisions

- **No Agent SDK** — using `claude -p` under Max subscription instead
- **Supabase over SQLite** — hosted Postgres + pgvector + REST API
- **Pipeline over monolith** — proven pattern from Ahgen, keeps scrape costs at zero
- **pgvector on insights only** — embedding raw signals would be wasteful
