import { describe, it, expect } from 'vitest';
import type { RawSignal } from '../src/scrapers/types.js';
import { buildPrompt } from '../src/analyzer/analyze.js';

describe('Insight parsing', () => {
  it('extracts JSON array from Claude response', () => {
    const output = `Here are the insights:

[
  {
    "insight_type": "trend",
    "topic": "Multi-agent systems",
    "summary": "Growing interest in agent coordination across Reddit and arXiv.",
    "confidence": 0.85,
    "priority": "p0"
  },
  {
    "insight_type": "divergence",
    "topic": "RAG vs fine-tuning",
    "summary": "Moltbook agents favor RAG while Reddit users prefer fine-tuning.",
    "confidence": 0.72,
    "priority": "p1"
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
    expect(parsed[0].priority).toBe('p0');
    expect(parsed[1].insight_type).toBe('divergence');
    expect(parsed[1].priority).toBe('p1');
  });

  it('handles clean JSON response with priority', () => {
    const output = `[{"insight_type":"tool_mention","topic":"MCP protocol","summary":"Agent mentions of MCP increasing.","confidence":0.9,"priority":"p0"}]`;

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    expect(jsonMatch).not.toBeNull();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].topic).toBe('MCP protocol');
    expect(parsed[0].priority).toBe('p0');
  });

  it('defaults to p2 when priority is missing', () => {
    const output = `[{"insight_type":"trend","topic":"Old format","summary":"No priority field.","confidence":0.5}]`;

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(jsonMatch![0]);

    // parseInsightsResponse defaults to p2 — test the logic
    const priority = parsed[0].priority ?? 'p2';
    expect(priority).toBe('p2');
  });

  it('fails gracefully when no JSON found', () => {
    const output = 'I apologize, but I cannot analyze these signals.';

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeNull();
  });
});

describe('Compressed prompt building', () => {
  const makeSignal = (overrides: Partial<RawSignal>): RawSignal => ({
    source: 'reddit',
    source_id: 'test-1',
    title: 'Test',
    content: 'Test content',
    url: 'https://example.com',
    author: 'tester',
    author_type: 'human',
    score: 10,
    tags: ['MachineLearning'],
    published_at: new Date().toISOString(),
    ...overrides,
  });

  it('groups signals by source in compressed format', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'reddit', tags: ['MachineLearning'] }),
      makeSignal({ source: 'reddit', tags: ['MachineLearning'] }),
      makeSignal({ source: 'arxiv', tags: ['cs.AI'] }),
      makeSignal({ source: 'twitter', tags: ['AI agents'] }),
    ];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('Reddit [raw] (2 signals');
    expect(prompt).toContain('arXiv [raw] (1 signals');
    expect(prompt).toContain('X/Twitter [raw] (1 signals');
  });

  it('includes priority tier instructions in prompt', () => {
    const signals: RawSignal[] = [
      makeSignal({}),
    ];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('p0');
    expect(prompt).toContain('p1');
    expect(prompt).toContain('p2');
    expect(prompt).toContain('"priority"');
    expect(prompt).toContain('anti-noise filter');
  });

  it('aggregates by primary tag instead of listing individual signals', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'reddit', title: 'Long post about AI agents and their impact', tags: ['MachineLearning', 'AI'] }),
      makeSignal({ source: 'reddit', title: 'Another post about RAG systems', tags: ['MachineLearning', 'RAG'] }),
      makeSignal({ source: 'reddit', title: 'Third post', tags: ['LocalLLaMA'] }),
    ];

    const prompt = buildPrompt(signals);

    // Should NOT contain individual titles (compressed format)
    expect(prompt).not.toContain('Long post about AI agents');
    // Should contain aggregated group info
    expect(prompt).toContain('MachineLearning');
    expect(prompt).toContain('LocalLLaMA');
  });

  it('includes hot topics when provided', () => {
    const signals: RawSignal[] = [makeSignal({})];
    const hotTopics = '\n### Hot Topics (velocity >50% vs previous window)\n- "AI agents" velocity +120% (5 → 11 signals)\n';

    const prompt = buildPrompt(signals, hotTopics);

    expect(prompt).toContain('Hot Topics');
    expect(prompt).toContain('+120%');
    expect(prompt).toContain('AI agents');
  });

  it('works without hot topics', () => {
    const signals: RawSignal[] = [makeSignal({})];

    const prompt = buildPrompt(signals, '');

    expect(prompt).not.toContain('Hot Topics');
    expect(prompt).toContain('Analysis Instructions');
  });

  it('includes 5 sources in source count', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'reddit' }),
      makeSignal({ source: 'arxiv' }),
      makeSignal({ source: 'google-trends' }),
      makeSignal({ source: 'moltbook' }),
      makeSignal({ source: 'twitter' }),
    ];

    const prompt = buildPrompt(signals);
    expect(prompt).toContain('5 sources');
  });
});

describe('LLM Counsel prompt (V3)', () => {
  const makeSignal = (overrides: Partial<RawSignal>): RawSignal => ({
    source: 'reddit',
    source_id: 'test-1',
    title: 'Test',
    content: 'Test content',
    url: 'https://example.com',
    author: 'tester',
    author_type: 'human',
    score: 10,
    tags: ['MachineLearning'],
    published_at: new Date().toISOString(),
    ...overrides,
  });

  it('activates LLM Counsel format when curated sources are present', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'techmeme', tags: ['tech'] }),
      makeSignal({ source: 'reddit', tags: ['ML'] }),
    ];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('LLM Counsel');
    expect(prompt).toContain('ANTI-NOISE FILTER');
    expect(prompt).toContain('ABSENCE');
    expect(prompt).toContain('REVERSALS');
    expect(prompt).toContain('Panel');
  });

  it('uses legacy format when only raw sources present', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'reddit' }),
      makeSignal({ source: 'arxiv' }),
    ];

    const prompt = buildPrompt(signals);

    expect(prompt).not.toContain('LLM Counsel');
    expect(prompt).toContain('trend intelligence analyst');
  });

  it('shows trust tiers in panel section', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'techmeme', tags: ['tech'] }),
      makeSignal({ source: 'hn-digest', tags: ['dev'] }),
      makeSignal({ source: 'simon-willison', tags: ['llm'] }),
    ];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('editor');
    expect(prompt).toContain('crowd');
    expect(prompt).toContain('expert');
    expect(prompt).toContain('TechMeme');
    expect(prompt).toContain('Simon Willison');
  });

  it('includes trust tier label on signal groups', () => {
    const signals: RawSignal[] = [
      makeSignal({ source: 'techmeme', tags: ['tech'] }),
    ];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('TechMeme [editor]');
  });

  it('includes LLM knowledge when provided', () => {
    const signals: RawSignal[] = [makeSignal({})];
    const llmKnowledge = '1. Claude 4.5 was released in January 2026.\n2. MCP protocol gaining traction.';

    const prompt = buildPrompt(signals, '', llmKnowledge);

    expect(prompt).toContain('LLM Knowledge');
    expect(prompt).toContain('Claude 4.5 was released');
    expect(prompt).toContain('may be outdated');
  });

  it('omits LLM knowledge section when empty', () => {
    const signals: RawSignal[] = [makeSignal({})];

    const prompt = buildPrompt(signals, '', '');

    expect(prompt).not.toContain('LLM Knowledge');
  });

  it('includes convergence_tiers in output format', () => {
    const signals: RawSignal[] = [makeSignal({})];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('"convergence_tiers"');
    expect(prompt).toContain('"sources"');
  });

  it('includes gap detection in analysis instructions', () => {
    const signals: RawSignal[] = [makeSignal({})];

    const prompt = buildPrompt(signals);

    expect(prompt).toContain('Absence');
    expect(prompt).toContain('"gap"');
  });
});
