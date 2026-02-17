# DeepTrend

Agent-optimized trend intelligence pipeline.
Curated signals from multiple sources are collected, synthesized, scored, and published in structured formats designed for automated consumption.

---

## Purpose

deeptrend exists to answer a single question:

**What developments in AI and technology are gaining real momentum across multiple independent signals?**

The system continuously:

1. Collects raw signals from curated feeds, APIs, and optional browser sources
2. Scores velocity and cross-source convergence
3. Synthesizes insights using an external LLM
4. Publishes machine-readable outputs for agents and downstream systems

The outputs are intended to be consumed programmatically, not primarily read by humans.

---

## Outputs (Primary Interfaces for Agents)

The following files in `/public` are the canonical interfaces:

**llms.txt**
Agent discovery entry point.
Summarizes the latest analysis and links to structured feeds.

**feed.json**
JSON Feed 1.1 with `_deeptrend` extensions.
Recommended format for ingestion pipelines.

Each item includes:

* topic
* summary
* priority (p0, p1, p2)
* insight_type
* confidence
* convergence metadata

**feed.xml**
RSS 2.0 compatibility feed.

**insights/YYYY-MM-DD.md**
Human-readable archive of daily analyses.

Agents should prefer `feed.json`.

---

## Core Concepts

### Signals

A signal is a single raw observation from any source.

Examples:

* trending search
* research paper
* repository activity
* community discussion
* announcement

Signals are stored in `raw_signals`.

Signals are deduplicated by:

(source, source_id)

---

### Insights

Insights are synthesized conclusions derived from multiple signals.

Each insight includes:

* topic
* summary
* insight_type
* priority
* confidence
* sources

Insights are stored in `insights`.

---

### Priority Model

Priority reflects cross-source convergence.

| Priority | Meaning                                         |
| -------- | ----------------------------------------------- |
| p0       | Convergence across multiple trust tiers         |
| p1       | Strong signals but limited cross-tier agreement |
| p2       | Early or weak signals                           |

Convergence is determined by:

* number of sources
* diversity of trust tiers
* velocity

---

### Trust Tiers

Signals are weighted by source reliability rather than raw volume.

Typical tiers include:

* editorial
* expert
* crowd
* algorithmic
* primary
* raw

Cross-tier agreement increases confidence.

---

### Velocity

Velocity measures change in signal frequency across time windows.

For each topic:

* current window count
* previous window count
* percentage change

Topics exceeding threshold growth are marked as hot and influence analysis prompts.

---

## Architecture Overview

Pipeline:

Scrapers
→ raw_signals (Supabase)
→ Velocity Scoring
→ LLM Counsel Analysis
→ insights (Supabase)
→ Publisher
→ Static agent feeds

The pipeline is designed to run continuously with minimal manual intervention.

---

## Data Flow

### Scrape Phase

Collect signals from:

* curated RSS feeds
* APIs
* optional browser sources

Store into:
raw_signals

---

### Analyze Phase

Reads:

* recent signals
* prior insights
* hot topics

Produces:

* structured insights
* priority classification

Stores into:
insights

---

### Publish Phase

Reads:
insights

Produces:

* llms.txt
* feed.json
* feed.xml
* markdown archives

---

## Command Line Interface

deeptrend exposes a CLI:

Scrape signals:

deeptrend scrape

Scrape curated feeds only:

deeptrend scrape --curated-only

Analyze recent signals:

deeptrend analyze

Publish feeds:

deeptrend publish

Research a specific topic:

deeptrend research "topic"

Show system status:

deeptrend status

---

## Scheduling Model

Typical automation:

Scrape:
every 15 minutes

Analyze + publish:
4 times per day

Scheduling is external to the application (e.g., launchd, cron).

---

## Database

Backend: Supabase (Postgres + pgvector)

Tables:

raw_signals
insights

raw_signals stores observations.
insights stores synthesized results.

Embeddings are stored only for insights to support semantic search.

---

## Environment Variables

Required:

SUPABASE_URL
SUPABASE_ANON_KEY

Optional:

CLAUDE_CLI
MOLTBOOK_API_KEY
CHROME_PROFILE_DIR

---

## Design Principles

1. Signals over opinions
2. Convergence over hype
3. Machine-readable first
4. Minimal dependencies in scraping layer
5. LLM used only where synthesis is required

---

## Intended Consumers

deeptrend is designed for:

* autonomous agents
* research pipelines
* monitoring dashboards
* decision-support systems
* market intelligence tools

Not optimized for:

* interactive UI usage
* narrative reporting

---

## Stability Guarantees

The following are considered stable interfaces:

* feed.json structure
* llms.txt presence
* priority levels (p0, p1, p2)
* insight_type taxonomy

Internal implementation may change without notice.

---

## Versioning

Feed formats may evolve.
Backward-compatible changes are preferred.

Breaking schema changes will be reflected in:

* version fields
* release notes

---

## License

See repository license file.

---

## Contact

Repository issues are the canonical channel for feedback or integration questions.
