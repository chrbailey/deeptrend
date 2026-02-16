import { chromium, type BrowserContext, type Response } from 'playwright';
import type { RawSignal, ScraperResult } from './types.js';

const DEFAULT_PROFILE_DIR = '.chrome-profile';
const SEARCH_QUERIES = ['AI agents', 'LLM', 'Claude', 'MCP protocol'];

interface TweetData {
  id: string;
  text: string;
  author: string;
  likes: number;
  retweets: number;
  hashtags: string[];
  created_at: string;
}

function getProfileDir(): string {
  return process.env.CHROME_PROFILE_DIR || DEFAULT_PROFILE_DIR;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTweetsFromGraphQL(body: unknown, searchQuery?: string): TweetData[] {
  const tweets: TweetData[] = [];

  try {
    const entries = extractTimelineEntries(body);
    for (const entry of entries) {
      const extracted = extractTweetsFromEntry(entry, searchQuery);
      tweets.push(...extracted);
    }
  } catch {
    // GraphQL structure varies — silently skip unparseable responses
  }

  return tweets;
}

function extractTimelineEntries(body: unknown): unknown[] {
  if (!body || typeof body !== 'object') return [];

  const json = body as Record<string, unknown>;

  // Navigate nested GraphQL response — handles multiple nesting patterns:
  // Search: data.search_by_raw_query.search_timeline.timeline.instructions[].entries[]
  // Trending: data.{key}.timeline.instructions[].entries[]
  const data = json.data as Record<string, unknown> | undefined;
  if (!data) return [];

  // Recursively find an 'instructions' array containing entries
  function findInstructions(obj: unknown, depth: number): unknown[] | null {
    if (depth > 5 || !obj || typeof obj !== 'object') return null;
    const record = obj as Record<string, unknown>;
    if (Array.isArray(record.instructions)) {
      for (const inst of record.instructions as unknown[]) {
        const i = inst as Record<string, unknown>;
        if (Array.isArray(i.entries)) return i.entries as unknown[];
      }
    }
    for (const val of Object.values(record)) {
      const result = findInstructions(val, depth + 1);
      if (result) return result;
    }
    return null;
  }

  return findInstructions(data, 0) ?? [];
}

function extractTweetsFromEntry(entry: unknown, searchQuery?: string): TweetData[] {
  const e = entry as Record<string, unknown>;
  const content = e.content as Record<string, unknown> | undefined;
  if (!content) return [];

  // Handle TimelineTimelineModule (grouped entries with items array)
  const items = content.items as unknown[] | undefined;
  if (items) {
    const tweets: TweetData[] = [];
    for (const item of items) {
      const itemObj = item as Record<string, unknown>;
      const innerItem = itemObj.item as Record<string, unknown> | undefined;
      const ic = innerItem?.itemContent as Record<string, unknown> | undefined;
      if (ic?.tweet_results) {
        const tweet = extractSingleTweet({ content: { itemContent: ic } }, searchQuery);
        if (tweet) tweets.push(tweet);
      }
    }
    return tweets;
  }

  // Handle regular TimelineTimelineItem
  const tweet = extractSingleTweet(entry, searchQuery);
  return tweet ? [tweet] : [];
}

function extractSingleTweet(entry: unknown, searchQuery?: string): TweetData | null {
  try {
    const e = entry as Record<string, unknown>;
    const content = e.content as Record<string, unknown> | undefined;
    const itemContent = content?.itemContent as Record<string, unknown> | undefined;
    const tweetResults = itemContent?.tweet_results as Record<string, unknown> | undefined;
    const result = tweetResults?.result as Record<string, unknown> | undefined;

    if (!result) return null;

    const legacy = result.legacy as Record<string, unknown> | undefined;
    const core = result.core as Record<string, unknown> | undefined;
    const userResults = core?.user_results as Record<string, unknown> | undefined;
    const userResult = userResults?.result as Record<string, unknown> | undefined;
    const userLegacy = userResult?.legacy as Record<string, unknown> | undefined;

    if (!legacy) return null;

    const restId = (result.rest_id ?? legacy.id_str ?? '') as string;
    const text = (legacy.full_text ?? '') as string;
    // screen_name can be in user's core or legacy depending on API version
    const userCore = userResult?.core as Record<string, unknown> | undefined;
    const author = (userCore?.screen_name ?? userLegacy?.screen_name ?? '') as string;
    const likes = (legacy.favorite_count ?? 0) as number;
    const retweets = (legacy.retweet_count ?? 0) as number;
    const createdAt = (legacy.created_at ?? '') as string;

    // Extract hashtags from entities
    const entities = legacy.entities as Record<string, unknown> | undefined;
    const hashtagEntities = (entities?.hashtags ?? []) as Array<Record<string, unknown>>;
    const hashtags = hashtagEntities
      .map((h) => (h.text ?? '') as string)
      .filter(Boolean);

    if (searchQuery) {
      hashtags.push(searchQuery);
    }

    if (!restId || !text) return null;

    return {
      id: restId,
      text,
      author,
      likes,
      retweets,
      hashtags: [...new Set(hashtags)],
      created_at: createdAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function tweetToSignal(tweet: TweetData): RawSignal {
  // Use first line or first 100 chars as title
  const firstLine = tweet.text.split('\n')[0];
  const title = firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine;

  return {
    source: 'twitter',
    source_id: `twitter-${tweet.id}`,
    title,
    content: tweet.text,
    url: `https://x.com/${tweet.author}/status/${tweet.id}`,
    author: tweet.author,
    author_type: 'human',
    score: tweet.likes + tweet.retweets,
    tags: tweet.hashtags,
    published_at: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
  };
}

export interface TwitterScraperOptions {
  headed?: boolean;
}

export async function scrapeTwitter(options?: TwitterScraperOptions): Promise<ScraperResult> {
  const errors: string[] = [];
  const allTweets: TweetData[] = [];
  let browser: BrowserContext | null = null;

  try {
    const profileDir = getProfileDir();
    const headless = options?.headed === true ? false : false; // Always headed for X bot detection

    browser = await chromium.launchPersistentContext(profileDir, {
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1920, height: 1080 },
    });

    const page = browser.pages()[0] || await browser.newPage();

    // Intercept GraphQL responses
    const responseHandler = async (response: Response) => {
      const url = response.url();
      if (!url.includes('/i/api/graphql/')) return;

      if (!url.includes('SearchTimeline') && !url.includes('ExploreTrends') && !url.includes('Trending') && !url.includes('GenericTimelineById') && !url.includes('SearchByRawQuery')) return;

      try {
        const body = await response.json();
        // Determine search query from the URL if it's a search request
        let searchQuery: string | undefined;
        const urlObj = new URL(url);
        const variables = urlObj.searchParams.get('variables');
        if (variables) {
          try {
            const parsed = JSON.parse(variables);
            searchQuery = parsed.rawQuery;
          } catch { /* ignore parse errors */ }
        }

        const tweets = parseTweetsFromGraphQL(body, searchQuery);
        allTweets.push(...tweets);
      } catch {
        // Response body may not be JSON — skip
      }
    };

    page.on('response', responseHandler);

    // Navigate to trending page
    try {
      await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(3000, 5000);
    } catch (err) {
      errors.push(`Failed to load trending page: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Search AI-specific topics
    for (const query of SEARCH_QUERIES) {
      try {
        await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&f=top`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await randomDelay(3000, 5000);
      } catch (err) {
        errors.push(`Failed to search "${query}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    page.off('response', responseHandler);
  } catch (err) {
    errors.push(`Twitter scraper failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch { /* ignore close errors */ }
    }
  }

  // Deduplicate by tweet ID
  const seen = new Set<string>();
  const uniqueTweets = allTweets.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const signals = uniqueTweets.map(tweetToSignal);

  return { source: 'twitter', signals, errors };
}

/**
 * Opens a Playwright browser for manual X login.
 * User logs in, closes the browser when done. Session persists.
 */
export async function loginToTwitter(): Promise<void> {
  const profileDir = getProfileDir();
  console.log(`Opening browser for X login (profile: ${profileDir})...`);
  console.log('Log in to x.com, then close the browser window when done.');

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1920, height: 1080 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded' });

  // Wait for user to close the browser
  await new Promise<void>((resolve) => {
    browser.on('close', () => resolve());
  });

  console.log('Login session saved.');
}
