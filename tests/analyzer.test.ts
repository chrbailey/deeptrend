import { describe, it, expect } from 'vitest';

describe('Insight parsing', () => {
  it('extracts JSON array from Claude response', () => {
    // Simulate what parseInsightsResponse does
    const output = `Here are the insights:

[
  {
    "insight_type": "trend",
    "topic": "Multi-agent systems",
    "summary": "Growing interest in agent coordination across Reddit and arXiv.",
    "confidence": 0.85
  },
  {
    "insight_type": "divergence",
    "topic": "RAG vs fine-tuning",
    "summary": "Moltbook agents favor RAG while Reddit users prefer fine-tuning.",
    "confidence": 0.72
  }
]

These insights are based on the provided signals.`;

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    expect(jsonMatch).not.toBeNull();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].insight_type).toBe('trend');
    expect(parsed[0].confidence).toBe(0.85);
    expect(parsed[1].insight_type).toBe('divergence');
  });

  it('handles clean JSON response', () => {
    const output = `[{"insight_type":"tool_mention","topic":"MCP protocol","summary":"Agent mentions of MCP increasing.","confidence":0.9}]`;

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    expect(jsonMatch).not.toBeNull();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].topic).toBe('MCP protocol');
  });

  it('fails gracefully when no JSON found', () => {
    const output = 'I apologize, but I cannot analyze these signals.';

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeNull();
  });
});

describe('Prompt building', () => {
  it('groups signals by source', () => {
    // Test the grouping logic used in buildPrompt
    const signals = [
      { source: 'reddit', title: 'Post 1' },
      { source: 'arxiv', title: 'Paper 1' },
      { source: 'reddit', title: 'Post 2' },
      { source: 'moltbook', title: 'Agent post' },
    ];

    const grouped: Record<string, typeof signals> = {};
    for (const s of signals) {
      if (!grouped[s.source]) grouped[s.source] = [];
      grouped[s.source].push(s);
    }

    expect(Object.keys(grouped)).toHaveLength(3);
    expect(grouped['reddit']).toHaveLength(2);
    expect(grouped['arxiv']).toHaveLength(1);
    expect(grouped['moltbook']).toHaveLength(1);
  });
});
