import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RawSignal } from '../src/scrapers/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('Google Trends scraper', () => {
  it('parses RSS feed into RawSignal array', async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:ht="https://trends.google.com/trends/trendingsearches/daily">
  <channel>
    <item>
      <title>AI agents</title>
      <link>https://trends.google.com/trends/explore?q=AI+agents</link>
      <pubDate>Fri, 14 Feb 2026 00:00:00 +0000</pubDate>
      <ht:approx_traffic>200,000+</ht:approx_traffic>
    </item>
    <item>
      <title>Claude Code</title>
      <link>https://trends.google.com/trends/explore?q=Claude+Code</link>
      <pubDate>Fri, 14 Feb 2026 00:00:00 +0000</pubDate>
      <ht:approx_traffic>50,000+</ht:approx_traffic>
    </item>
  </channel>
</rss>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(rssXml),
    });

    const { scrapeGoogleTrends } = await import('../src/scrapers/google-trends.js');
    const result = await scrapeGoogleTrends();

    expect(result.source).toBe('google-trends');
    expect(result.errors).toHaveLength(0);
    expect(result.signals).toHaveLength(2);
    expect(result.signals[0].title).toBe('AI agents');
    expect(result.signals[0].score).toBe(200000);
    expect(result.signals[0].author_type).toBe('human');
    expect(result.signals[1].title).toBe('Claude Code');
    expect(result.signals[1].score).toBe(50000);
  });

  it('handles HTTP errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const { scrapeGoogleTrends } = await import('../src/scrapers/google-trends.js');
    const result = await scrapeGoogleTrends();

    expect(result.signals).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('429');
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const { scrapeGoogleTrends } = await import('../src/scrapers/google-trends.js');
    const result = await scrapeGoogleTrends();

    expect(result.signals).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Network timeout');
  });
});

describe('Reddit scraper', () => {
  it('parses subreddit JSON into RawSignal array', { timeout: 15000 }, async () => {
    const redditJson = {
      data: {
        children: [
          {
            data: {
              id: 'abc123',
              title: 'New paper on multi-agent systems',
              selftext: 'This paper explores...',
              url: 'https://arxiv.org/abs/2402.12345',
              permalink: '/r/MachineLearning/comments/abc123/new_paper/',
              author: 'researcher42',
              score: 150,
              subreddit: 'MachineLearning',
              created_utc: 1739500000,
              link_flair_text: 'Research',
            },
          },
        ],
      },
    };

    // Return same JSON for each subreddit
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(redditJson),
    });

    const { scrapeReddit } = await import('../src/scrapers/reddit.js');
    const result = await scrapeReddit();

    expect(result.source).toBe('reddit');
    expect(result.signals.length).toBeGreaterThan(0);

    const signal = result.signals[0];
    expect(signal.source).toBe('reddit');
    expect(signal.source_id).toBe('reddit-abc123');
    expect(signal.author_type).toBe('human');
    expect(signal.score).toBe(150);
    expect(signal.tags).toContain('MachineLearning');
  });
});

describe('arXiv scraper', () => {
  it('parses Atom feed into RawSignal array', async () => {
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2402.12345v1</id>
    <title>Multi-Agent Coordination via Language Models</title>
    <summary>We propose a novel framework for coordinating multiple AI agents...</summary>
    <published>2026-02-14T00:00:00Z</published>
    <author><name>Jane Doe</name></author>
    <author><name>John Smith</name></author>
    <link href="http://arxiv.org/abs/2402.12345v1" />
    <arxiv:primary_category term="cs.MA" />
    <category term="cs.MA" />
    <category term="cs.AI" />
  </entry>
</feed>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(atomXml),
    });

    const { scrapeArxiv } = await import('../src/scrapers/arxiv.js');
    const result = await scrapeArxiv();

    expect(result.source).toBe('arxiv');
    expect(result.errors).toHaveLength(0);
    expect(result.signals).toHaveLength(1);

    const signal = result.signals[0];
    expect(signal.source_id).toBe('arxiv-2402.12345');
    expect(signal.title).toContain('Multi-Agent');
    expect(signal.author).toContain('Jane Doe');
    expect(signal.author_type).toBe('human');
    expect(signal.tags).toContain('cs.MA');
  });
});

describe('Moltbook scraper', () => {
  it('throws when API key is missing', async () => {
    delete process.env.MOLTBOOK_API_KEY;

    const { scrapeMoltbook } = await import('../src/scrapers/moltbook.js');
    const result = await scrapeMoltbook();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('MOLTBOOK_API_KEY');
  });

  it('parses posts and marks all authors as agents', async () => {
    process.env.MOLTBOOK_API_KEY = 'test-key';

    const posts = [
      {
        id: 'post-1',
        title: 'Agents discussing tool use',
        content: 'We should standardize how agents call tools...',
        submolt: 'agent-development',
        author: 'claw-agent-42',
        votes: 3,
        created_at: '2026-02-14T10:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(posts),
    });

    const { scrapeMoltbook } = await import('../src/scrapers/moltbook.js');
    const result = await scrapeMoltbook();

    expect(result.source).toBe('moltbook');
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].author_type).toBe('agent');
    expect(result.signals[0].tags).toContain('agent-development');
  });
});

describe('RawSignal type contract', () => {
  it('enforces required fields', () => {
    const signal: RawSignal = {
      source: 'reddit',
      source_id: 'test-1',
      title: 'Test',
      content: 'Test content',
      url: 'https://example.com',
      author: 'tester',
      author_type: 'human',
      score: 0,
      tags: [],
      published_at: new Date().toISOString(),
    };

    expect(signal.source).toBeDefined();
    expect(signal.source_id).toBeDefined();
    expect(signal.author_type).toBe('human');
  });
});
