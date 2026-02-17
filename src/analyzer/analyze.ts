import type { RawSignal, Insight } from '../scrapers/types.js';
import { getSignalsSince, getLastAnalysisTime, insertInsights } from '../db/supabase.js';
import { computeVelocity, formatHotTopics } from '../scoring/velocity.js';
import { getLLMKnowledge } from './llm-knowledge.js';
import { CURATED_FEEDS, type TrustTier } from '../scrapers/curated-feeds.js';

const CLAUDE_CLI = process.env.CLAUDE_CLI || 'claude';

// Trust tiers for all sources — curated feeds get their tier from config, V2 sources have fixed tiers
const SOURCE_TRUST: Record<string, TrustTier | 'raw'> = {
  'google-trends': 'raw',
  'reddit': 'raw',
  'arxiv': 'raw',
  'moltbook': 'raw',
  'twitter': 'raw',
};

// Build trust map from curated feed configs
for (const feed of CURATED_FEEDS) {
  SOURCE_TRUST[feed.source] = feed.trust;
}

// Source display names
const SOURCE_NAMES: Record<string, string> = {
  'google-trends': 'Google Trends',
  'reddit': 'Reddit',
  'arxiv': 'arXiv',
  'moltbook': 'Moltbook',
  'twitter': 'X/Twitter',
};

for (const feed of CURATED_FEEDS) {
  SOURCE_NAMES[feed.source] = feed.name;
}

// Source angle descriptions
const SOURCE_ANGLES: Record<string, string> = {
  'google-trends': 'search interest trends',
  'reddit': 'developer/researcher community discussion',
  'arxiv': 'academic preprints',
  'moltbook': 'AI agent discussions',
  'twitter': 'real-time social media',
};

for (const feed of CURATED_FEEDS) {
  SOURCE_ANGLES[feed.source] = feed.angle;
}

interface TagAggregate {
  tag: string;
  count: number;
  avgScore: number;
}

function aggregateByTag(signals: RawSignal[], topN = 5): TagAggregate[] {
  const tagMap = new Map<string, { count: number; totalScore: number }>();
  for (const s of signals) {
    for (const tag of s.tags) {
      const t = tag.toLowerCase();
      const entry = tagMap.get(t) ?? { count: 0, totalScore: 0 };
      entry.count++;
      entry.totalScore += s.score;
      tagMap.set(t, entry);
    }
  }

  return [...tagMap.entries()]
    .map(([tag, { count, totalScore }]) => ({
      tag,
      count,
      avgScore: Math.round(totalScore / count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function buildPrompt(signals: RawSignal[], hotTopics = '', llmKnowledge = ''): string {
  const grouped: Record<string, RawSignal[]> = {};
  for (const s of signals) {
    if (!grouped[s.source]) grouped[s.source] = [];
    grouped[s.source].push(s);
  }

  const sourceCount = Object.keys(grouped).length;
  const hasCuratedSources = Object.keys(grouped).some((s) => SOURCE_TRUST[s] && SOURCE_TRUST[s] !== 'raw');

  let prompt: string;

  if (hasCuratedSources) {
    // V3 LLM Counsel prompt — editorial quality over volume
    prompt = `## Analysis Framework: LLM Counsel

You are the editorial director of an intelligence brief for senior AI researchers.
Your readers are deeply embedded in the field — they already follow Twitter, read arXiv daily,
and know every major model release before it's announced. DO NOT tell them what they already know.

Your panel has ${sourceCount} independent curators/sources with different biases.

## THE ANTI-NOISE FILTER (apply to EVERY insight before including it)

Ask: "Would a senior AI researcher already know this from their normal information diet?"
If YES → kill it. Do not include it regardless of signal volume or velocity.

Examples of NOISE (never produce these):
- "AI agents are trending" — everyone knows this
- "LLM discussion is surging" — of course it is
- "OpenAI published a lot of content" — that's just their blog
- "Claude is being discussed" — we know, we work on it
- "Machine learning research is active" — it's always active
- Any insight that could be summarized as "[well-known topic] is [growing/trending/surging]"

## WHAT IS VALUABLE (prioritize these)

1. **ABSENCE**: What SHOULD be in the feeds but ISN'T?
   - Narratives that died (e.g., "emergent capabilities" was hot in 2023, now gone — why?)
   - Expected topics missing (safety research absent during a capabilities surge = significant)
   - Sources that went quiet (an expert who normally posts weekly hasn't posted — why?)

2. **REVERSALS**: What changed direction?
   - Sentiment shifts (topic went from positive to skeptical or vice versa)
   - Community migration (topic moved from one community to another)
   - Narrative pivots (same topic, different framing than last cycle)

3. **CROSS-DOMAIN SURPRISES**: Unexpected source combinations
   - Physics papers appearing in ML venues (e.g., cond-mat.dis-nn × cs.CL)
   - Crypto infrastructure in AI agent discussions
   - Academic papers trending in developer communities (or vice versa)
   - Topics where editor-tier and crowd-tier DISAGREE

4. **SPECIFIC over GENERAL**: Name the paper, tool, company, or person
   - BAD: "new model releases driving conversation"
   - GOOD: "Manus autonomous agent got TechMeme editor coverage — first agent-product to cross from developer tool to mainstream business narrative"

## PRIORITY RULES

- **p0**: Absence/reversal signals OR cross-domain surprise with 3+ sources — "this changes what I should pay attention to"
- **p1**: Specific non-obvious trend with 2+ sources OR notable single-source expert signal — "I should investigate this"
- **p2**: Early signals worth monitoring — "interesting if confirmed"

IMPORTANT: Volume alone NEVER makes something p0. A topic with 500 signals that everyone already knows about is p2 at best.
Cross-bias convergence on a NON-OBVIOUS topic is the gold standard for p0.

## DEDUPLICATION

Merge related insights. "Claude Mindshare" and "Claude/Anthropic Momentum" are the same insight — pick the better framing and combine.
Maximum 2 insights per broad topic area. If you have 3 LLM-related insights, merge the weakest into the strongest.

## Panel

`;

    // Group sources by trust tier
    const byTier: Record<string, string[]> = {};
    for (const source of Object.keys(grouped)) {
      const tier = String(SOURCE_TRUST[source] ?? 'raw');
      if (!byTier[tier]) byTier[tier] = [];
      const name = SOURCE_NAMES[source] ?? source;
      const angle = SOURCE_ANGLES[source] ?? '';
      byTier[tier].push(`${name} [${tier}]: ${angle}`);
    }

    for (const [tier, sources] of Object.entries(byTier)) {
      prompt += `### ${tier}\n`;
      for (const s of sources) {
        prompt += `- ${s}\n`;
      }
      prompt += '\n';
    }
  } else {
    // V2 legacy prompt
    prompt = `You are a trend intelligence analyst. Analyze these aggregated signals from ${sourceCount} sources and produce prioritized insights.

`;
  }

  prompt += `## Signals by Source (compressed)\n\n`;

  for (const [source, items] of Object.entries(grouped)) {
    const subGroups: Record<string, RawSignal[]> = {};
    for (const item of items) {
      const key = item.tags[0] ?? 'general';
      if (!subGroups[key]) subGroups[key] = [];
      subGroups[key].push(item);
    }

    const subGroupCount = Object.keys(subGroups).length;
    const trust = SOURCE_TRUST[source] ?? 'raw';
    const name = SOURCE_NAMES[source] ?? source;
    prompt += `### ${name} [${trust}] (${items.length} signals across ${subGroupCount} groups)\n`;

    for (const [group, groupItems] of Object.entries(subGroups)) {
      const topTags = aggregateByTag(groupItems, 3);
      const topTopics = topTags.map((t) => `${t.tag} (${t.count})`).join(', ');
      const authorTypes = new Set(groupItems.map((i) => i.author_type));
      const authorStr = [...authorTypes].join('+');
      prompt += `- ${group} (${groupItems.length}, ${authorStr}): Top topics: ${topTopics || 'none'}\n`;
    }

    prompt += '\n';
  }

  if (llmKnowledge) {
    prompt += `## LLM Knowledge (from Claude's training data)

Note: This may be outdated. Cross-reference with live feed signals above.

${llmKnowledge}

`;
  }

  if (hotTopics) {
    prompt += hotTopics;
    prompt += '\n';
  }

  prompt += `## Analysis Instructions

For each potential insight, apply the anti-noise filter FIRST. Then categorize:

1. **Absence** — what's missing that should be here? (most valuable)
2. **Reversal** — what changed direction from previous consensus?
3. **Cross-domain surprise** — unexpected source/topic combinations
4. **Specific trend** — a NAMED, SPECIFIC development (not "AI is trending")
5. **Divergence** — where do different trust tiers disagree on the same topic?

Every insight MUST pass the "so what?" test: state what a reader should DO differently because of this information.

## Output Format

Return ONLY a JSON array. No markdown, no explanation. Each object:
\`\`\`json
[
  {
    "insight_type": "trend" | "consensus" | "divergence" | "tool_mention" | "gap",
    "topic": "specific, named topic (not generic category)",
    "summary": "2-3 sentences. Be SPECIFIC: name papers, tools, people, companies. End with the 'so what' — what should the reader do with this information?",
    "confidence": 0.0-1.0,
    "priority": "p0" | "p1" | "p2",
    "sources": ["source-name-1", "source-name-2"],
    "convergence_tiers": ["editor", "crowd", "expert"]
  }
]
\`\`\`

Return 8-12 insights. Quality over quantity. Zero noise. Order by priority (p0 first), then confidence.
p0 count should be 1-3 at most — reserve it for genuinely surprising findings.`;

  return prompt;
}

function parseInsightsResponse(output: string): Insight[] {
  // Extract JSON from the response — claude -p may include surrounding text
  const jsonMatch = output.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No JSON array found in Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error('Parsed response is not an array');
  }

  return parsed.map((item: Record<string, unknown>) => ({
    insight_type: item.insight_type as Insight['insight_type'],
    topic: String(item.topic ?? ''),
    summary: String(item.summary ?? ''),
    sources: Array.isArray(item.sources) ? item.sources.map(String) : [],
    confidence: Number(item.confidence ?? 0),
    priority: (item.priority as Insight['priority']) ?? 'p2',
    convergence_tiers: Array.isArray(item.convergence_tiers) ? item.convergence_tiers.map(String) : undefined,
  }));
}

export async function runAnalysis(): Promise<{ insights: Insight[]; errors: string[] }> {
  const errors: string[] = [];

  // Get signals since last analysis (or last 24h if first run)
  const lastAnalysis = await getLastAnalysisTime();
  const since = lastAnalysis ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log(`Fetching signals since ${since.toISOString()}...`);
  const signals = await getSignalsSince(since);

  if (signals.length === 0) {
    console.log('No new signals to analyze.');
    return { insights: [], errors: [] };
  }

  console.log(`Analyzing ${signals.length} signals across ${new Set(signals.map((s) => s.source)).size} sources...`);

  // Compute velocity scores for hot topic detection
  let hotTopics = '';
  try {
    const velocityScores = await computeVelocity();
    hotTopics = formatHotTopics(velocityScores);
    const hotCount = velocityScores.filter((s) => s.is_hot).length;
    if (hotCount > 0) {
      console.log(`Detected ${hotCount} hot topics (velocity >50%).`);
    }
  } catch (err) {
    errors.push(`Velocity computation failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // Get LLM knowledge as additional panelist
  let llmKnowledge = '';
  try {
    console.log('Querying Claude for LLM knowledge panel...');
    llmKnowledge = await getLLMKnowledge();
    if (llmKnowledge && !llmKnowledge.includes('unavailable')) {
      console.log('LLM knowledge panel contributed.');
    }
  } catch (err) {
    errors.push(`LLM knowledge failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  const prompt = buildPrompt(signals, hotTopics, llmKnowledge);

  try {
    const insights = await runClaudeAnalysis(prompt);
    console.log(`Generated ${insights.length} insights.`);

    // Store insights
    const { inserted, errors: dbErrors } = await insertInsights(insights);
    errors.push(...dbErrors);
    console.log(`Stored ${inserted} insights in Supabase.`);

    return { insights, errors };
  } catch (err) {
    errors.push(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    return { insights: [], errors };
  }
}

async function runClaudeAnalysis(prompt: string): Promise<Insight[]> {
  const { spawn } = await import('node:child_process');

  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_CLI, ['-p', '--output-format', 'text', '--no-session-persistence', '--max-turns', '3'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDECODE: '' },
      timeout: 180_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const insights = parseInsightsResponse(stdout);
        resolve(insights);
      } catch (err) {
        reject(new Error(`Failed to parse Claude response: ${err instanceof Error ? err.message : String(err)}\nRaw output: ${stdout.slice(0, 500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    // Write prompt to stdin and close
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

export async function runResearch(topic: string): Promise<{ insights: Insight[]; errors: string[] }> {
  const errors: string[] = [];

  const prompt = `You are a trend intelligence analyst. Research the topic "${topic}" in depth.

Consider:
- What are the latest developments?
- What are experts (humans) saying vs AI agents?
- What tools or capabilities are emerging?
- What's the trajectory — growing, declining, plateauing?

Return ONLY a JSON array. Each object:
\`\`\`json
[
  {
    "insight_type": "trend" | "consensus" | "divergence" | "tool_mention",
    "topic": "short topic name",
    "summary": "2-3 sentence synthesis",
    "confidence": 0.0-1.0,
    "priority": "p0" | "p1" | "p2"
  }
]
\`\`\`

Priority: p0 = multi-source + high velocity, p1 = 2 sources or high confidence, p2 = emerging single-source.

Return 3-8 insights.`;

  try {
    const insights = await runClaudeAnalysis(prompt);
    const { inserted, errors: dbErrors } = await insertInsights(insights);
    errors.push(...dbErrors);
    console.log(`Research on "${topic}": ${insights.length} insights generated, ${inserted} stored.`);
    return { insights, errors };
  } catch (err) {
    errors.push(`Research failed: ${err instanceof Error ? err.message : String(err)}`);
    return { insights: [], errors };
  }
}
