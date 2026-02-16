import type { RawSignal, Insight } from '../scrapers/types.js';
import { getSignalsSince, getLastAnalysisTime, insertInsights } from '../db/supabase.js';
import { computeVelocity, formatHotTopics } from '../scoring/velocity.js';

const CLAUDE_CLI = process.env.CLAUDE_CLI || 'claude';

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

export function buildPrompt(signals: RawSignal[], hotTopics = ''): string {
  const grouped: Record<string, RawSignal[]> = {};
  for (const s of signals) {
    if (!grouped[s.source]) grouped[s.source] = [];
    grouped[s.source].push(s);
  }

  const sourceCount = Object.keys(grouped).length;

  let prompt = `You are a trend intelligence analyst. Analyze these aggregated signals from ${sourceCount} sources and produce prioritized insights.

## Signals by Source (compressed)

`;

  for (const [source, items] of Object.entries(grouped)) {
    // Group items by their primary tag (first tag) for sub-grouping
    const subGroups: Record<string, RawSignal[]> = {};
    for (const item of items) {
      const key = item.tags[0] ?? 'general';
      if (!subGroups[key]) subGroups[key] = [];
      subGroups[key].push(item);
    }

    const subGroupCount = Object.keys(subGroups).length;
    prompt += `### ${source} (${items.length} signals across ${subGroupCount} groups)\n`;

    for (const [group, groupItems] of Object.entries(subGroups)) {
      const topTags = aggregateByTag(groupItems, 3);
      const topTopics = topTags.map((t) => `${t.tag} (${t.count})`).join(', ');
      const authorTypes = new Set(groupItems.map((i) => i.author_type));
      const authorStr = [...authorTypes].join('+');
      prompt += `- ${group} (${groupItems.length}, ${authorStr}): Top topics: ${topTopics || 'none'}\n`;
    }

    prompt += '\n';
  }

  if (hotTopics) {
    prompt += hotTopics;
    prompt += '\n';
  }

  prompt += `## Analysis Instructions

Identify:
1. **Emerging trends** — topics appearing across multiple sources
2. **Agent consensus** — what Moltbook agents are converging on
3. **Agent-vs-human divergence** — where agent discussions (Moltbook) differ from human discussions (Reddit, arXiv, Twitter)
4. **Tool mentions** — new tools, APIs, libraries, or capabilities being discussed

## Priority Tiers

Assign a priority to each insight:
- **p0**: Topic appears in 3+ sources AND/OR has high velocity (>50% increase) — "act now"
- **p1**: Topic in 2 sources OR high confidence single-source — "watch closely"
- **p2**: Emerging single-source signal — "monitor"

## Output Format

Return ONLY a JSON array. No markdown, no explanation. Each object:
\`\`\`json
[
  {
    "insight_type": "trend" | "consensus" | "divergence" | "tool_mention",
    "topic": "short topic name",
    "summary": "2-3 sentence synthesis with evidence from signals",
    "confidence": 0.0-1.0,
    "priority": "p0" | "p1" | "p2"
  }
]
\`\`\`

Return 5-15 insights, ordered by priority (p0 first), then confidence.`;

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
    sources: [], // Will be populated if we add source linking
    confidence: Number(item.confidence ?? 0),
    priority: (item.priority as Insight['priority']) ?? 'p2',
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

  const prompt = buildPrompt(signals, hotTopics);

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
    const proc = spawn(CLAUDE_CLI, ['-p', '--output-format', 'text', '--no-session-persistence', '--max-turns', '1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDECODE: '' },
      timeout: 120_000,
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
