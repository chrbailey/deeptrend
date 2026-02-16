# deeptrend — Claude Instructions

## Overview

AI trend intelligence pipeline. V3 architecture: curated RSS feeds from 14+ sources → LLM Counsel analysis (convergence-based prioritization across trust tiers) → agent-optimized publishing (llms.txt, JSON Feed 1.1, RSS 2.0, structured markdown).

## Architecture

```
Curated RSS Feeds (13 feeds)  →  Supabase raw_signals
API Scrapers (4 sources)      →  (deduped by source + source_id)
Twitter (opt-in, browser)     →
                                    ↓
LLM Knowledge panelist        →  Analysis prompt (LLM Counsel)
Velocity scoring              →  (convergence across trust tiers)
                                    ↓
                              →  Supabase insights (p0/p1/p2)
                                    ↓
Publisher                     →  public/ (llms.txt, feed.json, feed.xml, insights/*.md)
```

### LLM Counsel Model

Signals are weighted by curator trust tier, not raw signal count:

| Tier | Sources | Weight |
|------|---------|--------|
| editor | TechMeme | Highest — human editorial curation |
| crowd | HN Digest, HuggingFace Papers | Community voting/engagement |
| expert | Simon Willison, Import AI, AlphaSignal, Last Week in AI, Ahead of AI, MarkTechPost | Domain expertise |
| algorithm | GitHub Trending | Algorithmic detection |
| primary | OpenAI News, Google Research, BAIR | First-party announcements |
| raw | Google Trends, Reddit, arXiv, Moltbook, Twitter | V2 scrapers |
| llm | Claude (training data) | Broad but may be outdated |

**Convergence = priority:** 3+ curators with different trust tiers = p0. Cross-bias agreement (e.g., safety researcher + startup community) boosts priority.

## Quick Commands

```bash
deeptrend scrape                     # Curated feeds + API scrapers (no browser)
deeptrend scrape --curated-only      # RSS feeds only (fast, no API keys needed)
deeptrend scrape --source twitter    # X/Twitter only (browser required)
deeptrend scrape --source reddit     # Single API source
deeptrend analyze                    # LLM Counsel analysis (includes LLM knowledge panelist)
deeptrend publish                    # Generate static site to public/
deeptrend publish --serve            # Generate + local HTTP server on :3000
deeptrend research "topic"           # On-demand deep dive
deeptrend login                      # Browser login for X/Twitter
deeptrend status                     # Signal/insight counts
npm test                             # 84 tests across 6 files
npm run typecheck                    # tsc --noEmit
```

## Sources (18 total)

### Curated RSS Feeds (13) — no auth, no browser
| Source | Trust | Angle |
|--------|-------|-------|
| TechMeme | editor | Mainstream tech business |
| HN Digest | crowd | Developer/startup community |
| Simon Willison | expert | LLM tools, open source |
| Import AI | expert | AI research, policy, safety |
| AlphaSignal | expert | Bleeding-edge research |
| Last Week in AI | expert | Balanced weekly roundup |
| Ahead of AI | expert | ML research, academic |
| MarkTechPost | expert | Accessible research coverage |
| GitHub Trending | algorithm | What's being built |
| HuggingFace Papers | crowd | ML papers trending |
| OpenAI News | primary | First-party announcements |
| Google Research | primary | Google AI research |
| BAIR | primary | Berkeley AI research |

### API Scrapers (4)
| Source | Method | Auth |
|--------|--------|------|
| Google Trends | RSS feed | None |
| Reddit | Public .json API | User-Agent only |
| arXiv | Atom API | None |
| Moltbook | REST API v1 | Bearer token |

### Browser Scraper (1, opt-in)
| Source | Method | Auth |
|--------|--------|------|
| X/Twitter | Playwright + GraphQL | Persistent session |

## Publishing Output

Agent-optimized static site in `public/`:

| File | Format | Purpose |
|------|--------|---------|
| `llms.txt` | Markdown | Agent discovery ([llms.txt spec](https://llmstxt.org/)) |
| `feed.json` | JSON Feed 1.1 | Structured data with `_deeptrend` extensions |
| `feed.xml` | RSS 2.0 | Backward compatibility |
| `insights/YYYY-MM-DD.md` | Markdown + YAML frontmatter | Human-readable archive |

JSON Feed items include `_deeptrend` extension with priority, confidence, convergence data (source count, trust tier breakdown).

## Data Model

- **raw_signals** — scraped data from 18 sources, deduped by (source, source_id), velocity column
- **insights** — Claude-generated analysis with type, topic, summary, confidence, priority (p0/p1/p2), convergence_tiers, pgvector embedding

## Environment Variables

See `.env.example`. Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Moltbook requires `MOLTBOOK_API_KEY`. Optional: `CLAUDE_CLI` (defaults to `claude`), `CHROME_PROFILE_DIR`.

## Scheduling

- `com.deeptrend.scrape` — every 15 min via launchd (curated feeds + API, no browser)
- `com.deeptrend.analyze` — 4x/day (6am, 12pm, 6pm, 12am) via launchd → analyze + publish

## Don't

- Don't add new sources without updating the `raw_signals` source CHECK constraint in SQL
- Don't call Claude API directly — always use `claude -p` (Max subscription)
- Don't scrape Moltbook without rate limiting — 100 req/min max
- Don't scrape X more than every 30 min — stay under rate limits
- Don't run X scraper in headless mode — triggers bot detection
- Don't commit `.chrome-profile/` or `public/` — generated artifacts
- Don't weaken convergence thresholds — 3+ different trust tiers = p0 is by design
