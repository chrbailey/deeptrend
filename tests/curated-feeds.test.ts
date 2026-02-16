import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFeed, CURATED_FEEDS, scrapeCuratedFeeds } from '../src/scrapers/curated-feeds.js';
import type { FeedConfig } from '../src/scrapers/curated-feeds.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('RSS 2.0 parsing', () => {
  it('parses standard RSS 2.0 feed', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <description>Article description</description>
      <pubDate>Mon, 16 Feb 2026 10:00:00 GMT</pubDate>
      <author>Author One</author>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      <description>&lt;p&gt;HTML content&lt;/p&gt;</description>
      <pubDate>Mon, 16 Feb 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('First Article');
    expect(items[0].link).toBe('https://example.com/1');
    expect(items[0].content).toBe('Article description');
    expect(items[0].author).toBe('Author One');
    expect(items[1].title).toBe('Second Article');
    expect(items[1].content).toBe('HTML content');
  });

  it('parses RSS with content:encoded', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title>Rich Content</title>
      <link>https://example.com/rich</link>
      <description>Short desc</description>
      <content:encoded>&lt;h1&gt;Full Article&lt;/h1&gt;&lt;p&gt;With paragraphs&lt;/p&gt;</content:encoded>
    </item>
  </channel>
</rss>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    // content:encoded takes precedence over description in RSS parsing
    // (our parser checks description first, then content:encoded — both are available)
    expect(items[0].title).toBe('Rich Content');
  });

  it('parses RSS with dc:creator author', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <item>
      <title>DC Creator Test</title>
      <link>https://example.com/dc</link>
      <dc:creator>Jane Author</dc:creator>
    </item>
  </channel>
</rss>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    expect(items[0].author).toBe('Jane Author');
  });

  it('handles single item (not array)', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Only Item</title>
      <link>https://example.com/only</link>
    </item>
  </channel>
</rss>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Only Item');
  });
});

describe('Atom parsing', () => {
  it('parses standard Atom feed', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry</title>
    <link rel="alternate" href="https://example.com/atom1"/>
    <summary>Entry summary</summary>
    <published>2026-02-16T10:00:00Z</published>
    <author><name>Atom Author</name></author>
  </entry>
</feed>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Atom Entry');
    expect(items[0].link).toBe('https://example.com/atom1');
    expect(items[0].content).toBe('Entry summary');
    expect(items[0].author).toBe('Atom Author');
  });

  it('parses Atom with multiple links (picks alternate)', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Multi Link</title>
    <link rel="self" href="https://example.com/self"/>
    <link rel="alternate" href="https://example.com/page"/>
    <summary>Test</summary>
  </entry>
</feed>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://example.com/page');
  });

  it('parses Atom with multiple authors', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Collab</title>
    <link href="https://example.com/collab"/>
    <author><name>Alice</name></author>
    <author><name>Bob</name></author>
    <summary>Joint work</summary>
  </entry>
</feed>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    expect(items[0].author).toBe('Alice, Bob');
  });

  it('handles single entry (not array)', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Solo Entry</title>
    <link href="https://example.com/solo"/>
    <summary>Solo</summary>
  </entry>
</feed>`;

    const items = parseFeed(xml);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Solo Entry');
  });
});

describe('Feed config', () => {
  it('has 13 curated feeds configured', () => {
    expect(CURATED_FEEDS).toHaveLength(13);
  });

  it('all feeds have required fields', () => {
    for (const feed of CURATED_FEEDS) {
      expect(feed.source).toBeTruthy();
      expect(feed.name).toBeTruthy();
      expect(feed.url).toMatch(/^https?:\/\//);
      expect(['editor', 'crowd', 'expert', 'algorithm', 'primary']).toContain(feed.trust);
      expect(feed.angle).toBeTruthy();
      expect(feed.defaultTags.length).toBeGreaterThan(0);
    }
  });

  it('all feed sources are unique', () => {
    const sources = CURATED_FEEDS.map((f) => f.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('has diverse trust tiers', () => {
    const tiers = new Set(CURATED_FEEDS.map((f) => f.trust));
    expect(tiers.size).toBeGreaterThanOrEqual(4);
  });
});

describe('scrapeCuratedFeeds', () => {
  it('returns one ScraperResult per feed', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'test-feed-1',
        name: 'Test Feed 1',
        url: 'https://test1.example.com/feed.xml',
        trust: 'expert',
        angle: 'testing',
        defaultTags: ['test'],
      },
      {
        source: 'test-feed-2',
        name: 'Test Feed 2',
        url: 'https://test2.example.com/feed.xml',
        trust: 'crowd',
        angle: 'testing',
        defaultTags: ['test'],
      },
    ];

    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Item A</title><link>https://test.com/a</link><description>Desc A</description></item>
  <item><title>Item B</title><link>https://test.com/b</link><description>Desc B</description></item>
</channel></rss>`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(rss),
    });

    const results = await scrapeCuratedFeeds(testFeeds);

    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('test-feed-1');
    expect(results[0].signals).toHaveLength(2);
    expect(results[0].errors).toHaveLength(0);
    expect(results[1].source).toBe('test-feed-2');
    expect(results[1].signals).toHaveLength(2);
  });

  it('deduplicates items with same link within a feed', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'dedup-test',
        name: 'Dedup Test',
        url: 'https://dedup.example.com/feed.xml',
        trust: 'expert',
        angle: 'testing',
        defaultTags: ['test'],
      },
    ];

    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Same Article</title><link>https://test.com/same</link></item>
  <item><title>Same Article Again</title><link>https://test.com/same</link></item>
  <item><title>Different Article</title><link>https://test.com/different</link></item>
</channel></rss>`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(rss),
    });

    const results = await scrapeCuratedFeeds(testFeeds);

    expect(results[0].signals).toHaveLength(2); // deduped
  });

  it('isolates errors per feed — one failure does not block others', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'good-feed',
        name: 'Good Feed',
        url: 'https://good.example.com/feed.xml',
        trust: 'expert',
        angle: 'works',
        defaultTags: ['test'],
      },
      {
        source: 'bad-feed',
        name: 'Bad Feed',
        url: 'https://bad.example.com/feed.xml',
        trust: 'expert',
        angle: 'broken',
        defaultTags: ['test'],
      },
    ];

    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Good Item</title><link>https://good.com/1</link></item>
</channel></rss>`;

    mockFetch
      .mockImplementation((url: string) => {
        if (url.includes('bad')) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve(rss) });
      });

    const results = await scrapeCuratedFeeds(testFeeds);

    expect(results).toHaveLength(2);
    expect(results[0].signals).toHaveLength(1);
    expect(results[0].errors).toHaveLength(0);
    expect(results[1].signals).toHaveLength(0);
    expect(results[1].errors).toHaveLength(1);
    expect(results[1].errors[0]).toContain('500');
  });

  it('handles network errors gracefully', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'timeout-feed',
        name: 'Timeout Feed',
        url: 'https://timeout.example.com/feed.xml',
        trust: 'expert',
        angle: 'slow',
        defaultTags: ['test'],
      },
    ];

    mockFetch.mockRejectedValue(new Error('Network timeout'));

    const results = await scrapeCuratedFeeds(testFeeds);

    expect(results).toHaveLength(1);
    expect(results[0].signals).toHaveLength(0);
    expect(results[0].errors).toHaveLength(1);
    expect(results[0].errors[0]).toContain('Network timeout');
  });

  it('adds default tags and extracted keywords to signals', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'tag-test',
        name: 'Tag Test',
        url: 'https://tags.example.com/feed.xml',
        trust: 'expert',
        angle: 'testing',
        defaultTags: ['ai', 'research'],
      },
    ];

    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Claude 4.5 Released With Improved Reasoning</title>
    <link>https://test.com/claude</link>
  </item>
</channel></rss>`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(rss),
    });

    const results = await scrapeCuratedFeeds(testFeeds);
    const signal = results[0].signals[0];

    expect(signal.tags).toContain('ai');
    expect(signal.tags).toContain('research');
    // Extracted keywords from title
    expect(signal.tags).toContain('claude');
    expect(signal.tags).toContain('released');
    expect(signal.tags).toContain('improved');
    expect(signal.tags).toContain('reasoning');
  });

  it('sets author to feed name when item has no author', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'no-author',
        name: 'My Feed Name',
        url: 'https://noauthor.example.com/feed.xml',
        trust: 'expert',
        angle: 'testing',
        defaultTags: ['test'],
      },
    ];

    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>No Author Item</title><link>https://test.com/x</link></item>
</channel></rss>`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(rss),
    });

    const results = await scrapeCuratedFeeds(testFeeds);
    expect(results[0].signals[0].author).toBe('My Feed Name');
  });

  it('strips HTML from content', async () => {
    const testFeeds: FeedConfig[] = [
      {
        source: 'html-test',
        name: 'HTML Test',
        url: 'https://html.example.com/feed.xml',
        trust: 'expert',
        angle: 'testing',
        defaultTags: ['test'],
      },
    ];

    const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>HTML Article</title>
    <link>https://test.com/html</link>
    <description>&lt;p&gt;This has &lt;strong&gt;bold&lt;/strong&gt; and &lt;a href="x"&gt;links&lt;/a&gt;&lt;/p&gt;</description>
  </item>
</channel></rss>`;

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(rss),
    });

    const results = await scrapeCuratedFeeds(testFeeds);
    expect(results[0].signals[0].content).toBe('This has bold and links');
  });
});
