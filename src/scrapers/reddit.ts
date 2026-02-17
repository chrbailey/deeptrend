import type { RawSignal, ScraperResult } from './types.js';

const SUBREDDITS = [
  'MachineLearning',
  'artificial',
  'LocalLLaMA',
  'OpenAI',
  'singularity',
];

const USER_AGENT = process.env.REDDIT_USER_AGENT || 'deeptrend/0.2.0';

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    author: string;
    score: number;
    subreddit: string;
    created_utc: number;
    link_flair_text?: string;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
  };
}

// OAuth token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    return null; // Fall back to unauthenticated
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    if (!res.ok) {
      console.error(`Reddit OAuth failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error(`Reddit OAuth error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function scrapeSubreddit(subreddit: string): Promise<{ signals: RawSignal[]; errors: string[] }> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    const token = await getOAuthToken();
    const baseUrl = token
      ? `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=25`
      : `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(baseUrl, { headers });

    if (!res.ok) {
      errors.push(`Reddit r/${subreddit} returned ${res.status}`);
      return { signals, errors };
    }

    const listing: RedditListing = await res.json();

    for (const post of listing.data.children) {
      const d = post.data;
      signals.push({
        source: 'reddit',
        source_id: `reddit-${d.id}`,
        title: d.title,
        content: d.selftext || d.title,
        url: `https://www.reddit.com${d.permalink}`,
        author: d.author,
        author_type: 'human',
        score: d.score,
        tags: [d.subreddit, d.link_flair_text].filter(Boolean) as string[],
        published_at: new Date(d.created_utc * 1000).toISOString(),
      });
    }
  } catch (err) {
    errors.push(`Reddit r/${subreddit} scrape failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { signals, errors };
}

export async function scrapeReddit(): Promise<ScraperResult> {
  const allSignals: RawSignal[] = [];
  const allErrors: string[] = [];

  // Scrape sequentially to respect rate limits
  for (const sub of SUBREDDITS) {
    const { signals, errors } = await scrapeSubreddit(sub);
    allSignals.push(...signals);
    allErrors.push(...errors);
    // Small delay between subreddits to be polite
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { source: 'reddit', signals: allSignals, errors: allErrors };
}
