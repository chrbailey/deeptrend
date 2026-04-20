# Changelog

All notable changes to deeptrend are recorded here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- README now reflects actual publishing cadence: **paused** (2026-04-16). Previous wording ("published every 6 hours") overstated the current state. The code still supports the 6h cadence when the scheduler is running — see the run history below.

### Added
- This CHANGELOG.
- Frontmatter fields `update_frequency: paused`, `last_published`, and `status` so agents consuming `/feed.json` or `/llms.txt` can detect staleness programmatically.

## Publishing cadence — history

| Period | Cadence | Mechanism | State |
|--------|---------|-----------|-------|
| 2026-02-16 → 2026-02-24 | ~Daily bursts, up to every few hours | Local launchd (`com.deeptrend.scrape` every 15 min, `com.deeptrend.analyze` 4x/day) → GitHub Pages auto-deploy on `public/**` push | ran |
| 2026-02-24 → 2026-04-11 | None | Scheduler still loaded but analysis ceased; no new insights published | gap |
| 2026-04-11 → present | None | `com.deeptrend.*` plists unloaded during ops-center teardown; GitHub Actions has deploy-only workflow, no cron | **paused** |

Latest published insight: `public/insights/2026-02-24.md`, item id `2026-02-24-insight-1`.

## What would unpause it

Either of:

1. Reload the local launchd agents on the Mac Mini:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.deeptrend.scrape.plist
   launchctl load ~/Library/LaunchAgents/com.deeptrend.analyze.plist
   ```
   Requires the Mac Mini to be online and the `.env` (Supabase, Moltbook, Claude CLI) to remain valid.

2. Replace the local scheduler with a GitHub Actions cron workflow that runs `deeptrend scrape && deeptrend analyze && deeptrend publish` and commits `public/**`. Requires moving Supabase + Moltbook secrets into repo secrets.

## 2026-02-17 — Initial public launch

- 14+ curated sources wired (TechMeme, HN, Simon Willison, Import AI, AlphaSignal, Last Week in AI, Ahead of AI, MarkTechPost, GitHub Trending, HuggingFace Papers, OpenAI News, Google Research, BAIR, plus API scrapers for Google Trends, Reddit, arXiv, Moltbook, and opt-in X/Twitter).
- LLM Counsel convergence scoring (3+ trust tiers = p0).
- Publishing targets: `llms.txt`, `feed.json` (JSON Feed 1.1), `feed.xml` (RSS 2.0), daily `insights/*.md` archives, `hot.json`, schema file.
- GitHub Pages deployment via `deploy-pages.yml` workflow (push on `public/**`).
