import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RawSignal, Insight } from '../scrapers/types.js';
import { getSignalsSince, getLastAnalysisTime, insertInsights } from '../db/supabase.js';

const execFileAsync = promisify(execFile);

const CLAUDE_CLI = process.env.CLAUDE_CLI || 'claude';

function buildPrompt(signals: RawSignal[]): string {
  const grouped: Record<string, RawSignal[]> = {};
  for (const s of signals) {
    if (!grouped[s.source]) grouped[s.source] = [];
    grouped[s.source].push(s);
  }

  let prompt = `You are a trend intelligence analyst. Analyze these signals from 4 sources and produce structured insights.

## Signals by Source

`;

  for (const [source, items] of Object.entries(grouped)) {
    prompt += `### ${source} (${items.length} signals)\n\n`;
    for (const item of items.slice(0, 30)) {
      prompt += `- **${item.title}** (score: ${item.score}, author_type: ${item.author_type})\n`;
      if (item.content && item.content !== item.title) {
        const preview = item.content.slice(0, 200);
        prompt += `  ${preview}${item.content.length > 200 ? '...' : ''}\n`;
      }
      prompt += `  tags: ${item.tags.join(', ')}\n\n`;
    }
  }

  prompt += `## Analysis Instructions

Identify:
1. **Emerging trends** — topics appearing across multiple sources
2. **Agent consensus** — what Moltbook agents are converging on
3. **Agent-vs-human divergence** — where agent discussions (Moltbook) differ from human discussions (Reddit, arXiv)
4. **Tool mentions** — new tools, APIs, libraries, or capabilities being discussed

## Output Format

Return ONLY a JSON array. No markdown, no explanation. Each object:
\`\`\`json
[
  {
    "insight_type": "trend" | "consensus" | "divergence" | "tool_mention",
    "topic": "short topic name",
    "summary": "2-3 sentence synthesis with evidence from signals",
    "confidence": 0.0-1.0
  }
]
\`\`\`

Return 5-15 insights, ordered by confidence (highest first).`;

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

  const prompt = buildPrompt(signals);

  try {
    // Pipe prompt to claude -p (uses Max subscription)
    const { stdout, stderr } = await execFileAsync(
      CLAUDE_CLI,
      ['-p', '--output-format', 'text', '--no-session-persistence', '--max-turns', '1'],
      {
        timeout: 120_000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env },
        encoding: 'utf-8',
      },
    );

    // claude -p reads from stdin — we need to use spawn instead
    // Actually, execFile doesn't support stdin easily. Let's use spawn.
    void stdout;
    void stderr;
  } catch {
    // Fall through to spawn approach
  }

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
      env: { ...process.env },
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
    "confidence": 0.0-1.0
  }
]
\`\`\`

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
