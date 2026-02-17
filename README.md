# DeepTrend

type: agent-data-source
format: structured feeds
update_frequency: ~6 hours
primary_interface: /public/feed.json
discovery_file: /public/llms.txt
schema_version: 1

---

## Overview

deeptrend is a continuously running trend-intelligence pipeline that:

1. Collects raw signals from multiple independent sources
2. Measures topic velocity and cross-source convergence
3. Synthesizes insights using an external language model
4. Publishes structured outputs for automated consumption

Outputs are designed for ingestion by agents, pipelines, and monitoring systems.

Human readability is secondary.

---

## Canonical Interfaces

Agents should use these endpoints in order of preference.

### 1. JSON Feed (Primary)

`/public/feed.json`

Recommended ingestion format.

Contains:

* topic
* summary
* priority
* insight_type
* confidence
* convergence metadata
* tags
* timestamps

Stable structure is maintained across releases.

---

### 2. Discovery File

`/public/llms.txt`

Provides:

* latest analysis reference
* feed locations
* archive links

Entry point for automated discovery.

---

### 3. RSS Feed (Compatibility)

`/public/feed.xml`

Provided for compatibility with systems that require RSS 2.0.

---

### 4. Archive

`/public/insights/YYYY-MM-DD.md`

Human-readable daily archive.
Not recommended for automated ingestion.

---

## Data Model

### Signals

A signal is a single observation collected from a source.

Examples:

* trending search
* research paper
* forum discussion
* repository activity
* announcement

Signals are stored in:

`raw_signals`

Deduplication key:

```
(source, source_id)
```

Signals represent raw observations only.
No synthesis or interpretation occurs at this stage.

---

### Insights

Insights are synthesized conclusions derived from multiple signals.

Stored in:

`insights`

Each insight contains:

* topic
* summary
* insight_type
* priority
* confidence
* sources
* analyzed_at

Embeddings may be stored for semantic search.

---

## Priority Model

Priority reflects cross-source convergence strength.

| Priority | Meaning                                        |
| -------- | ---------------------------------------------- |
| p0       | Strong convergence across multiple trust tiers |
| p1       | Significant signals with partial convergence   |
| p2       | Early or weak signals                          |

Priority is derived from:

* velocity
* number of sources
* trust tier diversity
* synthesis confidence

---

## Velocity Model

Velocity measures change in signal frequency between time windows.

For each topic:

velocity = (current_count − previous_count) / previous_count

Topics exceeding growth thresholds may be marked as hot and influence synthesis prompts.

Velocity is computed deterministically before analysis.

---

## Trust Tiers

Signals may be categorized by reliability tier.

Typical tiers include:

* editorial
* expert
* primary
* algorithmic
* crowd
* raw

Cross-tier agreement increases confidence.

---

## Pipeline Architecture

```
Scrapers
   ↓
raw_signals (Supabase)
   ↓
Velocity Scoring
   ↓
LLM Synthesis
   ↓
insights (Supabase)
   ↓
Publisher
   ↓
Agent Feeds
```

Each stage is isolated and deterministic where possible.

LLM usage is restricted to synthesis tasks.

---

## Data Flow

### Scrape Phase

Collect signals from:

* curated RSS feeds
* APIs
* optional browser sources

Write:
raw_signals

---

### Analyze Phase

Reads:

* recent signals
* previous insights
* velocity signals

Produces:

* structured insights
* priority classification

Write:
insights

---

### Publish Phase

Reads:
insights

Produces:

* llms.txt
* feed.json
* feed.xml
* archives

---

## Command Line Interface

Primary commands:

Scrape:

```
deeptrend scrape
```

Curated feeds only:

```
deeptrend scrape --curated-only
```

Analyze:

```
deeptrend analyze
```

Publish:

```
deeptrend publish
```

Research a topic:

```
deeptrend research "topic"
```

Status:

```
deeptrend status
```

---

## Scheduling Model

Typical automation:

Scrape:
every 15 minutes

Analyze:
4 times per day

Publish:
after analysis

Scheduling is external (cron, launchd, or equivalent).

---

## Database

Backend:
Postgres (Supabase)

Tables:

* raw_signals
* insights

Embeddings are stored only for insights.

---

## Environment Variables

Required:

```
SUPABASE_URL
SUPABASE_ANON_KEY
```

Optional:

```
CLAUDE_CLI
MOLTBOOK_API_KEY
CHROME_PROFILE_DIR
```

---

## Stability Guarantees

The following interfaces are considered stable:

* feed.json schema
* llms.txt presence
* priority taxonomy (p0, p1, p2)
* insight_type categories

Internal implementation may change without notice.

Breaking schema changes will be versioned.

---

## Intended Consumers

Designed for:

* autonomous agents
* monitoring pipelines
* research systems
* market intelligence tooling
* automated dashboards

Not optimized for:

* interactive UI
* narrative reporting
* manual browsing

---

## Design Principles

* Signals over opinions
* Measurement before synthesis
* Convergence over volume
* Machine-readable first
* Deterministic stages where possible

---

## Versioning

Feed schemas may evolve.

Backward compatibility is preferred.

Schema changes will be indicated in:

* version fields
* commit history

---

## License

See repository license.

---

If you want, I can also produce a **“minimal ultra-machine README”** variant (about 40 lines, extremely terse) that some indexing agents actually parse faster than full READMEs.
