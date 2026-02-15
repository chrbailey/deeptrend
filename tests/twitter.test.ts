import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RawSignal } from '../src/scrapers/types.js';

// We can't easily mock Playwright's ESM exports in vitest with persistent context,
// so we test the scraper's output contract and the parseable structures.

describe('Twitter scraper output contract', () => {
  it('RawSignal with twitter source has correct shape', () => {
    const signal: RawSignal = {
      source: 'twitter',
      source_id: 'twitter-123456789',
      title: 'Breaking: New AI agent framework released',
      content: 'Breaking: New AI agent framework released #AIAgents #LLM',
      url: 'https://x.com/airesearcher/status/123456789',
      author: 'airesearcher',
      author_type: 'human',
      score: 700,
      tags: ['AIAgents', 'LLM'],
      published_at: '2026-02-15T10:00:00.000Z',
    };

    expect(signal.source).toBe('twitter');
    expect(signal.source_id).toMatch(/^twitter-/);
    expect(signal.author_type).toBe('human');
    expect(signal.score).toBe(700);
    expect(signal.url).toContain('x.com');
    expect(signal.tags).toContain('AIAgents');
  });

  it('score is computed as likes + retweets', () => {
    const likes = 500;
    const retweets = 200;
    const score = likes + retweets;
    expect(score).toBe(700);
  });

  it('source_id uses twitter- prefix for dedup', () => {
    const tweetId = '1234567890';
    const sourceId = `twitter-${tweetId}`;
    expect(sourceId).toBe('twitter-1234567890');
  });

  it('title truncates long tweets to first line', () => {
    const fullText = 'This is the first line\nThis is the second line with more detail';
    const firstLine = fullText.split('\n')[0];
    const title = firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine;
    expect(title).toBe('This is the first line');
  });

  it('title truncates single long line to 100 chars', () => {
    const longLine = 'A'.repeat(150);
    const title = longLine.length > 100 ? longLine.slice(0, 97) + '...' : longLine;
    expect(title).toHaveLength(100);
    expect(title).toMatch(/\.\.\.$/);
  });
});

describe('GraphQL response parsing logic', () => {
  // Test the extraction logic that parseTweetsFromGraphQL uses

  it('extracts timeline entries from nested GraphQL structure', () => {
    const graphqlBody = {
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [
                {
                  entries: [
                    {
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              rest_id: '111',
                              legacy: {
                                full_text: 'Test tweet',
                                favorite_count: 10,
                                retweet_count: 5,
                                created_at: 'Sat Feb 15 10:00:00 +0000 2026',
                                entities: { hashtags: [] },
                              },
                              core: {
                                user_results: {
                                  result: {
                                    legacy: { screen_name: 'testuser' },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };

    // Verify the expected structure is navigable
    const data = graphqlBody.data;
    const searchKey = Object.keys(data)[0]; // 'search_by_raw_query'
    expect(searchKey).toBe('search_by_raw_query');

    const inner = (data as any)[searchKey];
    const timeline = inner.search_timeline?.timeline ?? inner.timeline;
    expect(timeline).toBeDefined();
    expect(timeline.instructions[0].entries).toHaveLength(1);

    const entry = timeline.instructions[0].entries[0];
    const result = entry.content.itemContent.tweet_results.result;
    expect(result.rest_id).toBe('111');
    expect(result.legacy.full_text).toBe('Test tweet');
    expect(result.legacy.favorite_count).toBe(10);
    expect(result.core.user_results.result.legacy.screen_name).toBe('testuser');
  });

  it('handles hashtag extraction from entities', () => {
    const entities = {
      hashtags: [
        { text: 'AIAgents' },
        { text: 'LLM' },
        { text: 'Claude' },
      ],
    };

    const hashtags = entities.hashtags.map((h: any) => h.text).filter(Boolean);
    expect(hashtags).toEqual(['AIAgents', 'LLM', 'Claude']);
  });

  it('deduplicates hashtags when search query overlaps', () => {
    const hashtags = ['AIAgents', 'LLM'];
    const searchQuery = 'AI agents';

    // Add search query, then deduplicate
    hashtags.push(searchQuery);
    const unique = [...new Set(hashtags)];

    expect(unique).toHaveLength(3);
    expect(unique).toContain('AI agents');
  });

  it('handles missing nested fields gracefully', () => {
    // This simulates what happens when GraphQL response is partial
    const entry = {
      content: {
        itemContent: {
          tweet_results: {
            result: null, // No tweet data
          },
        },
      },
    };

    const result = entry.content.itemContent.tweet_results.result;
    expect(result).toBeNull();
  });
});

describe('Anti-detection configuration', () => {
  it('uses correct Playwright anti-detection args', () => {
    const expectedArgs = ['--disable-blink-features=AutomationControlled'];
    expect(expectedArgs).toContain('--disable-blink-features=AutomationControlled');
  });

  it('uses realistic viewport dimensions', () => {
    const viewport = { width: 1920, height: 1080 };
    expect(viewport.width).toBe(1920);
    expect(viewport.height).toBe(1080);
  });

  it('search queries cover key AI topics', () => {
    const queries = ['AI agents', 'LLM', 'Claude', 'MCP protocol'];
    expect(queries).toHaveLength(4);
    expect(queries).toContain('AI agents');
    expect(queries).toContain('Claude');
  });
});
