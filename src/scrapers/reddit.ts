import type { RawSignal, ScraperResult } from './types.js';

const SUBREDDITS = [
  'MachineLearning',
  'artificial',
  'LocalLLaMA',
  'OpenAI',
  'singularity',
];

const USER_AGENT = process.env.REDDIT_USER_AGENT || 'deeptrend/0.1.0';

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

async function scrapeSubreddit(subreddit: string): Promise<{ signals: RawSignal[]; errors: string[] }> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
      headers: { 'User-Agent': USER_AGENT },
    });

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
