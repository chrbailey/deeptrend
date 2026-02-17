# Show HN Submission

## Title

Show HN: deeptrend -- AI trend feed that penalizes "trending" signals, rewards absence

## URL

https://chrbailey.github.io/deeptrend/

---

## Top Comment

I built deeptrend because every AI trend tracker I found was useless for the same reason: they tell you what's trending. You already know what's trending. You have Twitter, you read HN, you skim arXiv. "AI agents are hot" is not insight -- it's noise.

deeptrend inverts the approach. The analysis prompt explicitly penalizes volume-based signals and instead hunts for three things: **absence** (what stopped being discussed?), **reversals** (what changed direction?), and **cross-domain surprises** (unexpected source combinations on the same topic). The highest-priority insight from today's feed isn't "OpenAI is dominating discourse" -- it's "safety/alignment research is completely absent during an OpenAI signal surge." OpenAI signals jumped 13,600%. Zero mentions of safety across 5 independent sources including r/MachineLearning. The absence IS the signal.

The technical approach: 14 curated sources (TechMeme, HN, Simon Willison, arXiv, Google Research, etc.) organized by trust tier (editor, crowd, expert, algorithm, primary, raw). Signals go through velocity scoring, then an LLM synthesis step with an aggressive anti-noise prompt. Convergence across 3+ different trust tiers is what makes something p0, not raw volume. Every insight must pass: "would a senior AI researcher say 'I didn't know that'?" If the answer is no, it gets killed regardless of signal count.

It publishes every 6 hours as JSON Feed 1.1 with a `_deeptrend` extension, plus `hot.json` (minimal payload for agents), RSS 2.0, `llms.txt`, and markdown archives. Designed to be consumed by agents and monitoring pipelines, not read in a browser:

```bash
curl -s https://chrbailey.github.io/deeptrend/hot.json | jq '.p0'
```

Source: https://github.com/chrbailey/deeptrend

Interested in feedback on the editorial approach. The anti-noise prompt is the core IP here -- is the "absence > volume" framing actually useful, or am I just building a contrarian signal detector?
