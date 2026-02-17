# Every AI Trend Tracker Is Broken. Here's What I Built Instead.

*The most valuable signal in an information feed isn't what's loud. It's what went quiet.*

---

Every AI trend tracker tells you AI agents are trending. You already know that. You have Twitter, you skim Hacker News, you glance at arXiv. A system that tells you "LLM discussion is surging" is a system that wastes your time.

I spent two months building [deeptrend](https://chrbailey.github.io/deeptrend/), a structured AI trend feed that publishes every 6 hours. But the interesting part isn't the pipeline or the data -- it's the editorial approach, which inverts how signal detection normally works.

## The Problem: Volume Is Noise

Traditional trend detection counts mentions. More mentions = more important. This works for stock tickers and breaking news. It does not work for AI, where the loudest signals are almost always the least useful.

Consider this feed from a recent cycle: OpenAI signals jumped 13,600% (from 6 to 822). Every trend tracker on the planet will tell you "OpenAI is surging." Great. You knew that before you opened the dashboard.

But here is what no trend tracker told you: across 52 signals from 5 independent sources with different editorial biases, there was **zero** mention of safety, alignment, or responsible AI. During the biggest capability announcement surge of the quarter, the entire safety discourse vanished. Not just reduced -- absent. From Reddit's r/MachineLearning, from TechMeme's editorial picks, from Google Trends search data. Gone.

That absence is the actual signal. And it's invisible to any system that ranks by volume.

## The Inversion: Absence > Volume

deeptrend's analysis prompt explicitly penalizes "trending" signals and rewards three types of non-obvious patterns:

**1. Absence Detection**
What SHOULD be in the feeds but isn't? Narratives that died. Expected topics that disappeared. Sources that went quiet.

Real example from today's feed:
> **p0: Safety/alignment research absent during OpenAI signal surge** -- OpenAI signals jumped +13,600% but NONE of the signal groups across any source mention safety, alignment, or responsible AI. The complete absence of safety discourse across all 5 sources suggests either safety framing has been fully absorbed into product marketing or the research community has stopped treating safety as a distinct concern.

**2. Reversal Detection**
What changed direction? Sentiment shifts, community migration, narrative pivots where the same topic gets different framing than last cycle.

**3. Cross-Domain Surprises**
Unexpected source combinations. Physics papers in ML venues. Crypto infrastructure in agent discussions. Topics where editors and crowds disagree.

Real example:
> **p1: Simon Willison's LLM/tools focus vs mainstream OpenAI fixation** -- Willison's single signal is about practical developer tooling while the rest of the ecosystem is fixated on OpenAI announcements. His silence on the surge suggests the announcements may be less technically significant than the volume implies.

The editorial rule is explicit: **volume alone NEVER makes something p0.** A topic with 500 signals that everyone already knows about is p2 at best. Cross-bias convergence on a non-obvious topic is the gold standard.

## How It Works

```
Curated RSS Feeds (14) + API Scrapers
            |
     raw_signals (Supabase)
            |
     Velocity Scoring
            |
     LLM Counsel Synthesis (anti-noise, absence/reversal detection)
            |
        insights (p0 / p1 / p2)
            |
     Publisher -> feed.json, feed.xml, hot.json, llms.txt, archives
            |
     GitHub Pages (auto-deploy)
```

14+ sources are organized into trust tiers:

| Tier | Sources | What it catches |
|------|---------|-----------------|
| Editor | TechMeme | What editors think matters |
| Crowd | HN Digest, HuggingFace Papers | What developers/researchers upvote |
| Expert | Simon Willison, Import AI, AlphaSignal, Ahead of AI | Practitioner analysis |
| Algorithm | GitHub Trending | What's being built |
| Primary | OpenAI News, Google Research, BAIR | First-party announcements |
| Raw | Reddit, arXiv, Google Trends | Unfiltered community signal |

The key insight: convergence across different trust tiers is what promotes an insight to p0. If TechMeme's editors (editor tier), Reddit (raw tier), and Google Trends (raw tier) all surface the same absence, that's more meaningful than a single source screaming about it at high volume. Cross-bias agreement on non-obvious topics is the gold standard.

Every insight goes through the anti-noise filter before inclusion:

> "Would a senior AI researcher already know this from their normal information diet? If YES -- kill it. Do not include it regardless of signal volume or velocity."

This is hard-coded into the LLM synthesis prompt. It's not a suggestion -- it's a gating rule.

## Designed for Machines, Not Browsers

deeptrend is designed to be consumed by agents, monitoring pipelines, and research tools -- not read in a browser. The output formats reflect this:

```bash
# Get current p0/p1 insights (smallest payload, ~2KB)
curl -s https://chrbailey.github.io/deeptrend/hot.json | jq '.p0'
```

```json
[
  {
    "topic": "Safety/alignment research absent during OpenAI signal surge",
    "type": "divergence",
    "confidence": 0.75,
    "summary": "OpenAI signals jumped +13,600% but NONE of the signal groups...",
    "sources": ["reddit", "google-trends", "techmeme"]
  }
]
```

```bash
# Get full structured feed with _deeptrend extension
curl -s https://chrbailey.github.io/deeptrend/feed.json | jq '.items[:3]'
```

Every feed item includes a `_deeptrend` extension with priority level, insight type, confidence score, and convergence metadata (source count, contributing sources, trust tier breakdown). There's a [JSON Schema](https://chrbailey.github.io/deeptrend/schema/feed.schema.json) for validation.

For agents: the [`llms.txt`](https://chrbailey.github.io/deeptrend/llms.txt) file provides structured discovery per the [llms.txt spec](https://llmstxt.org/).

For humans who still want to read: [daily markdown archives](https://chrbailey.github.io/deeptrend/insights/2026-02-17.md) with YAML frontmatter.

## What I Learned

**Absence detection is hard to evaluate.** When the system flags something as missing, how do you verify it's genuinely absent and not just between cycles? The velocity scoring helps -- comparing current window to previous window -- but there's inherent uncertainty in claiming "X disappeared." I settled on requiring the absence to be cross-source (multiple independent feeds confirming the gap) before promoting it.

**The anti-noise prompt needs constant pressure.** LLMs naturally gravitate toward summarizing what's loudest. Left to its own devices, Claude will produce "OpenAI is trending" insights every cycle. The editorial prompt has to actively fight this tendency with explicit kill rules and worked examples of noise.

**Trust tiers matter more than source count.** Five Reddit signals agreeing on something is less interesting than Reddit + TechMeme + Simon Willison agreeing on something, because those sources have different editorial biases. Convergence across bias boundaries is the real signal.

## Try It

The feed is live and updates every 6 hours:

- Hot topics: [hot.json](https://chrbailey.github.io/deeptrend/hot.json)
- Full feed: [feed.json](https://chrbailey.github.io/deeptrend/feed.json)
- Agent discovery: [llms.txt](https://chrbailey.github.io/deeptrend/llms.txt)
- Source: [github.com/chrbailey/deeptrend](https://github.com/chrbailey/deeptrend)

If you're building an agent that needs to know what's actually changing in AI -- not what's loudest -- point it at `hot.json` and filter for p0.

The question I'm still working on: is "absence as signal" a genuinely useful editorial lens, or just a sophisticated way to be contrarian? The early results suggest the former -- the safety-discourse gap and the Anthropic-silence insight both turned out to be predictive of announcements that followed days later. But the sample size is small. I'd rather ship it and find out than theorize.

---

*deeptrend is MIT licensed. [GitHub](https://github.com/chrbailey/deeptrend).*
