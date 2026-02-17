---
name: deeptrend
type: agent-data-source
domain: ai-trends
formats: json-feed, rss, llms-txt
update_frequency: 6h
primary_endpoint: https://chrbailey.github.io/deeptrend/feed.json
discovery: https://chrbailey.github.io/deeptrend/llms.txt
hot_topics: https://chrbailey.github.io/deeptrend/hot.json
schema: /schema/feed.schema.json
repo: https://github.com/chrbailey/deeptrend
---

# deeptrend

Structured AI trend feed for autonomous agents, monitoring systems, and research pipelines that need early signal detection in AI and infrastructure trends.

Curated from 14+ sources. Synthesized via LLM Counsel. Published every 6 hours.

## Quick Start

```bash
# Get current hot topics (smallest payload)
curl -s https://chrbailey.github.io/deeptrend/hot.json | jq .

# Get full structured feed
curl -s https://chrbailey.github.io/deeptrend/feed.json | jq '.items[:3]'
```

```python
import requests
feed = requests.get("https://chrbailey.github.io/deeptrend/feed.json").json()
for item in feed["items"]:
    dt = item["_deeptrend"]
    print(f"[{dt['priority']}] {item['title']} (confidence: {dt['confidence']})")
```

```javascript
const feed = await fetch("https://chrbailey.github.io/deeptrend/feed.json").then(r => r.json());
const p0 = feed.items.filter(i => i._deeptrend.priority === "p0");
```

## Endpoints

| Endpoint | Format | Use case |
|----------|--------|----------|
| [`/hot.json`](https://chrbailey.github.io/deeptrend/hot.json) | JSON | Current state only, minimal payload |
| [`/feed.json`](https://chrbailey.github.io/deeptrend/feed.json) | JSON Feed 1.1 | Full structured feed (recommended) |
| [`/feed.xml`](https://chrbailey.github.io/deeptrend/feed.xml) | RSS 2.0 | Legacy compatibility |
| [`/llms.txt`](https://chrbailey.github.io/deeptrend/llms.txt) | Markdown | Agent discovery file |
| [`/insights/YYYY-MM-DD.md`](https://chrbailey.github.io/deeptrend/insights/2026-02-17.md) | Markdown | Daily archive |

Schema: [`/schema/feed.schema.json`](schema/feed.schema.json)

## Feed Item Structure

Each item in `feed.json` includes a `_deeptrend` extension:

```json
{
  "id": "2026-02-17-insight-1",
  "title": "Safety/alignment research absent during OpenAI signal surge",
  "content_text": "...",
  "date_published": "2026-02-17T06:00:00Z",
  "tags": ["p0", "divergence", "reddit", "techmeme"],
  "_deeptrend": {
    "priority": "p0",
    "insight_type": "trend | consensus | divergence | tool_mention | gap",
    "confidence": 0.75,
    "convergence": {
      "source_count": 3,
      "sources": ["reddit", "google-trends", "techmeme"]
    }
  }
}
```

## Priority Model

| Priority | Meaning | Typical count |
|----------|---------|---------------|
| p0 | Non-obvious signal: absence, reversal, or cross-domain surprise | 1-3 per run |
| p1 | Specific trend with 2+ sources or notable expert signal | 3-6 per run |
| p2 | Early signal worth monitoring | 2-4 per run |

Volume alone never makes something p0. "AI agents are trending" is noise. "Safety discourse disappeared during a capabilities surge" is signal.

## Sources (14+)

| Tier | Sources | What it catches |
|------|---------|-----------------|
| Editor | TechMeme | What editors think matters |
| Crowd | HN Digest, HuggingFace Papers | What developers/researchers upvote |
| Expert | Simon Willison, Import AI, AlphaSignal, Last Week in AI, Ahead of AI, MarkTechPost | Practitioner analysis |
| Algorithm | GitHub Trending | What's being built |
| Primary | OpenAI News, Google Research, BAIR | First-party announcements |
| Raw | Reddit, arXiv, Google Trends | Unfiltered community signal |

## Pipeline

```
Curated RSS Feeds (14) + API Scrapers
            |
     raw_signals (Supabase)
            |
     Velocity Scoring
            |
     LLM Counsel Synthesis (anti-noise, absence/reversal detection)
            |
        insights
            |
     Publisher -> feed.json, feed.xml, hot.json, llms.txt, archives
            |
     GitHub Pages (auto-deploy on push)
```

## Design Principles

- Absence and reversal signals are more valuable than volume
- Cross-bias convergence on non-obvious topics is the gold standard
- Every insight must pass: "would a senior AI researcher say 'I didn't know that'?"
- Machine-readable first, human-readable second
- Deterministic stages where possible, LLM only for synthesis

## License

MIT
