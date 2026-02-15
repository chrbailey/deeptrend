import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
const mockSelect = vi.fn();
const mockGte = vi.fn();
const mockLt = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../src/db/supabase.js', () => ({
  getClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the chain
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ gte: mockGte });
  mockGte.mockReturnValue({ lt: mockLt });
});

describe('computeVelocity', () => {
  it('computes velocity as percentage change between windows', async () => {
    const now = new Date('2026-02-15T12:00:00Z');

    // Current window (8:00-12:00): 10 signals tagged "AI agents"
    // Previous window (4:00-8:00): 5 signals tagged "AI agents"
    mockLt
      .mockResolvedValueOnce({
        data: Array(10).fill({ tags: ['AI agents'] }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array(5).fill({ tags: ['AI agents'] }),
        error: null,
      });

    const { computeVelocity } = await import('../src/scoring/velocity.js');
    const scores = await computeVelocity(4, now);

    const aiAgents = scores.find((s) => s.topic === 'ai agents');
    expect(aiAgents).toBeDefined();
    expect(aiAgents!.current_count).toBe(10);
    expect(aiAgents!.previous_count).toBe(5);
    expect(aiAgents!.velocity).toBe(100); // 100% increase
    expect(aiAgents!.is_hot).toBe(true);
  });

  it('marks topics with >50% increase as hot', async () => {
    const now = new Date('2026-02-15T12:00:00Z');

    mockLt
      .mockResolvedValueOnce({
        data: [
          { tags: ['hot-topic'] },
          { tags: ['hot-topic'] },
          { tags: ['hot-topic'] },
          { tags: ['cold-topic'] },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { tags: ['hot-topic'] },
          { tags: ['cold-topic'] },
          { tags: ['cold-topic'] },
        ],
        error: null,
      });

    const { computeVelocity } = await import('../src/scoring/velocity.js');
    const scores = await computeVelocity(4, now);

    const hot = scores.find((s) => s.topic === 'hot-topic');
    expect(hot!.is_hot).toBe(true);
    expect(hot!.velocity).toBe(200); // 1 → 3 = 200%

    const cold = scores.find((s) => s.topic === 'cold-topic');
    expect(cold!.is_hot).toBe(false);
    expect(cold!.velocity).toBe(-50); // 2 → 1 = -50%
  });

  it('treats new topics (no previous signals) as 100% velocity', async () => {
    const now = new Date('2026-02-15T12:00:00Z');

    mockLt
      .mockResolvedValueOnce({
        data: [{ tags: ['brand-new'] }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });

    const { computeVelocity } = await import('../src/scoring/velocity.js');
    const scores = await computeVelocity(4, now);

    const brandNew = scores.find((s) => s.topic === 'brand-new');
    expect(brandNew).toBeDefined();
    expect(brandNew!.velocity).toBe(100);
    expect(brandNew!.is_hot).toBe(true);
  });

  it('returns empty array when no signals in either window', async () => {
    const now = new Date('2026-02-15T12:00:00Z');

    mockLt
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const { computeVelocity } = await import('../src/scoring/velocity.js');
    const scores = await computeVelocity(4, now);

    expect(scores).toHaveLength(0);
  });

  it('sorts results by velocity descending', async () => {
    const now = new Date('2026-02-15T12:00:00Z');

    mockLt
      .mockResolvedValueOnce({
        data: [
          { tags: ['slow'] },
          { tags: ['fast'] },
          { tags: ['fast'] },
          { tags: ['fast'] },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { tags: ['slow'] },
          { tags: ['fast'] },
        ],
        error: null,
      });

    const { computeVelocity } = await import('../src/scoring/velocity.js');
    const scores = await computeVelocity(4, now);

    expect(scores[0].topic).toBe('fast'); // 200% velocity
    expect(scores[1].topic).toBe('slow'); // 0% velocity
  });
});

describe('formatHotTopics', () => {
  it('formats hot topics for prompt inclusion', async () => {
    const { formatHotTopics } = await import('../src/scoring/velocity.js');

    const scores = [
      { topic: 'AI agents', current_count: 30, previous_count: 10, velocity: 200, is_hot: true },
      { topic: 'boring', current_count: 5, previous_count: 5, velocity: 0, is_hot: false },
    ];

    const output = formatHotTopics(scores);
    expect(output).toContain('AI agents');
    expect(output).toContain('+200%');
    expect(output).not.toContain('boring');
  });

  it('returns empty string when no hot topics', async () => {
    const { formatHotTopics } = await import('../src/scoring/velocity.js');

    const scores = [
      { topic: 'steady', current_count: 5, previous_count: 5, velocity: 0, is_hot: false },
    ];

    expect(formatHotTopics(scores)).toBe('');
  });
});
