# deeptrend — Claude Instructions

## Overview

Trend intelligence pipeline that scrapes 4 sources, stores raw signals in Supabase, and uses `claude -p` (Max subscription) for cross-source analysis.

## Architecture

```
Scrapers (TypeScript, no LLM)    →  Supabase raw_signals
Analyzer (claude -p via Max)     →  Supabase insights
CLI on-demand research           →  scrape + analyze in one shot
```

## Quick Commands

```bash
npm run scrape          # Scrape all 4 sources
npm run analyze         # Run Claude analysis on recent signals
npm start -- research "topic"  # On-demand deep dive
npm test                # 12 tests
npm run typecheck       # tsc --noEmit
```

## Sources

| Source | Method | Auth |
|--------|--------|------|
| Google Trends | RSS feed (XML) | None |
| Reddit | Public .json API | User-Agent header only |
| arXiv | Atom API (XML) | None |
| Moltbook | REST API v1 | Bearer token (MOLTBOOK_API_KEY) |

## Data Model

- **raw_signals** — scraped data from all sources, deduped by (source, source_id)
- **insights** — Claude-generated analysis with type, topic, summary, confidence, pgvector embedding

## Environment Variables

See `.env.example`. Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Moltbook requires `MOLTBOOK_API_KEY`.

## Scheduling

- `com.deeptrend.scrape` — every 15 min via launchd
- `com.deeptrend.analyze` — 4x/day (6am, 12pm, 6pm, 12am) via launchd

## Don't

- Don't add new sources without updating the `raw_signals` source CHECK constraint in SQL
- Don't call Claude API directly — always use `claude -p` (Max subscription)
- Don't scrape Moltbook without rate limiting — 100 req/min max
