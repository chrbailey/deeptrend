const CLAUDE_CLI = process.env.CLAUDE_CLI || 'claude';

const KNOWLEDGE_PROMPT = `List the 5-10 most significant AI/tech developments you're aware of from your training data that are relevant RIGHT NOW. For each:

1. One sentence on what happened
2. Approximate date (month/year)
3. Why it matters for practitioners

Focus on:
- Major model releases or capability jumps
- Infrastructure/tooling shifts (new frameworks, protocols)
- Policy or regulatory developments
- Research breakthroughs not yet widely covered
- Events that may not appear in RSS feeds yet

Return as a numbered list. Be specific — names, versions, organizations. Skip anything older than 6 months unless it has ongoing impact.`;

export async function getLLMKnowledge(): Promise<string> {
  const { spawn } = await import('node:child_process');

  return new Promise((resolve, reject) => {
    const proc = spawn(
      CLAUDE_CLI,
      ['-p', '--output-format', 'text', '--no-session-persistence', '--max-turns', '1'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDECODE: '' },
        timeout: 60_000,
      },
    );

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
        // Non-fatal — analysis can proceed without LLM knowledge
        console.warn(`LLM knowledge extraction failed (exit ${code}): ${stderr.slice(0, 200)}`);
        resolve('(LLM knowledge unavailable for this run)');
        return;
      }
      resolve(stdout.trim());
    });

    proc.on('error', (err) => {
      console.warn(`Failed to spawn claude for LLM knowledge: ${err.message}`);
      resolve('(LLM knowledge unavailable for this run)');
    });

    proc.stdin.write(KNOWLEDGE_PROMPT);
    proc.stdin.end();
  });
}
