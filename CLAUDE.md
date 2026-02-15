# deeptrend — Claude Instructions

## Overview

Trend intelligence pipeline that scrapes 5 sources (including X/Twitter), stores raw signals in Supabase, computes velocity scoring, and uses `claude -p` (Max subscription) for cross-source analysis with priority tiers.

## Architecture

```
Scrapers (TypeScript, no LLM)    →  Supabase raw_signals
Velocity scoring (post-scrape)   →  hot topic detection
Analyzer (claude -p via Max)     →  Supabase insights (with p0/p1/p2 priority)
CLI on-demand research           →  scrape + analyze in one shot
```

## Quick Commands

```bash
npm run scrape                       # Scrape all 5 sources
npm run scrape -- --source twitter   # Scrape X/Twitter only
npm run scrape -- --headed           # Scrape with visible browser window
npm run analyze                      # Run Claude analysis on recent signals
npm start -- research "topic"        # On-demand deep dive
npm start -- login                   # Open browser for manual X login
npm test                             # 37 tests
npm run typecheck                    # tsc --noEmit
```

## Sources

| Source | Method | Auth |
|--------|--------|------|
| Google Trends | RSS feed (XML) | None |
| Reddit | Public .json API | User-Agent header only |
| arXiv | Atom API (XML) | None |
| Moltbook | REST API v1 | Bearer token (MOLTBOOK_API_KEY) |
| X/Twitter | Playwright + GraphQL interception | Persistent browser session |

### X/Twitter Setup

1. Run `npm start -- login` — opens Playwright Chrome
2. Log in to x.com manually, then close browser
3. Session persists in `.chrome-profile/` directory
4. Subsequent scrapes use saved session automatically

Anti-detection: headed mode, `--disable-blink-features=AutomationControlled`, human-like delays (3-5s), realistic viewport (1920x1080).

## Data Model

- **raw_signals** — scraped data from all sources, deduped by (source, source_id), optional `velocity` column
- **insights** — Claude-generated analysis with type, topic, summary, confidence, `priority` (p0/p1/p2), pgvector embedding

### Priority Tiers

- **p0**: Topic in 3+ sources AND/OR velocity >50% — "act now"
- **p1**: Topic in 2 sources OR high confidence single-source — "watch closely"
- **p2**: Emerging single-source signal — "monitor"

### Velocity Scoring

Compares signal tag counts between current and previous time windows (default 4h). Topics with >50% increase flagged as "hot" and injected into the analysis prompt.

## Environment Variables

See `.env.example`. Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Moltbook requires `MOLTBOOK_API_KEY`. Optional: `CHROME_PROFILE_DIR` (defaults to `.chrome-profile/`).

## Scheduling

- `com.deeptrend.scrape` — every 15 min via launchd (Twitter: every 30 min recommended)
- `com.deeptrend.analyze` — 4x/day (6am, 12pm, 6pm, 12am) via launchd

## Don't

- Don't add new sources without updating the `raw_signals` source CHECK constraint in SQL
- Don't call Claude API directly — always use `claude -p` (Max subscription)
- Don't scrape Moltbook without rate limiting — 100 req/min max
- Don't scrape X more than every 30 min — stay well under rate limits
- Don't run X scraper in headless mode — triggers bot detection
- Don't commit `.chrome-profile/` — contains login session cookies
