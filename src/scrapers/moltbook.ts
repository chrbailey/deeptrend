import type { RawSignal, ScraperResult } from './types.js';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  submolt: string;
  author: string;
  votes: number;
  created_at: string;
}

interface MoltbookComment {
  id: string;
  content: string;
  author: string;
  votes: number;
  created_at: string;
}

function getApiKey(): string {
  const key = process.env.MOLTBOOK_API_KEY;
  if (!key) {
    throw new Error('Missing MOLTBOOK_API_KEY in environment. Register at POST https://www.moltbook.com/api/v1/agents/register');
  }
  return key;
}

async function fetchPosts(apiKey: string, sort = 'hot', limit = 25): Promise<MoltbookPost[]> {
  const res = await fetch(`${MOLTBOOK_API}/posts?sort=${sort}&limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Moltbook GET /posts returned ${res.status}`);
  }

  return res.json();
}

async function fetchComments(apiKey: string, postId: string): Promise<MoltbookComment[]> {
  const res = await fetch(`${MOLTBOOK_API}/posts/${postId}/comments?sort=top`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Moltbook GET /posts/${postId}/comments returned ${res.status}`);
  }

  return res.json();
}

export async function scrapeMoltbook(): Promise<ScraperResult> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    const apiKey = getApiKey();

    // Get hot posts
    const posts = await fetchPosts(apiKey, 'hot', 25);

    for (const post of posts) {
      signals.push({
        source: 'moltbook',
        source_id: `moltbook-post-${post.id}`,
        title: post.title,
        content: post.content,
        url: `https://www.moltbook.com/post/${post.id}`,
        author: post.author,
        author_type: 'agent', // All Moltbook authors are agents
        score: post.votes,
        tags: [post.submolt].filter(Boolean),
        published_at: new Date(post.created_at).toISOString(),
      });

      // Fetch top comments for high-scoring posts
      if (post.votes >= 5) {
        try {
          const comments = await fetchComments(apiKey, post.id);
          for (const comment of comments.slice(0, 10)) {
            signals.push({
              source: 'moltbook',
              source_id: `moltbook-comment-${comment.id}`,
              title: `Re: ${post.title}`,
              content: comment.content,
              url: `https://www.moltbook.com/post/${post.id}`,
              author: comment.author,
              author_type: 'agent',
              score: comment.votes,
              tags: [post.submolt, 'comment'].filter(Boolean),
              published_at: new Date(comment.created_at).toISOString(),
            });
          }
          // Respect rate limit: 100 req/min
          await new Promise((resolve) => setTimeout(resolve, 700));
        } catch (err) {
          errors.push(`Moltbook comments for post ${post.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Moltbook scrape failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { source: 'moltbook', signals, errors };
}
