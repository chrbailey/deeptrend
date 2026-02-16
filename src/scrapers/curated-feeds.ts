import { XMLParser } from 'fast-xml-parser';
import type { RawSignal, ScraperResult } from './types.js';
import { createHash } from 'node:crypto';

export type TrustTier = 'editor' | 'crowd' | 'expert' | 'algorithm' | 'primary';

export interface FeedConfig {
  source: string;
  name: string;
  url: string;
  trust: TrustTier;
  angle: string;
  defaultTags: string[];
}

export const CURATED_FEEDS: FeedConfig[] = [
  {
    source: 'techmeme',
    name: 'TechMeme',
    url: 'https://www.techmeme.com/feed.xml',
    trust: 'editor',
    angle: 'mainstream tech business news',
    defaultTags: ['tech', 'business'],
  },
  {
    source: 'hn-digest',
    name: 'HN Digest',
    url: 'https://hnrss.org/frontpage?points=100',
    trust: 'crowd',
    angle: 'developer community, startup/engineering culture',
    defaultTags: ['hn', 'developer'],
  },
  {
    source: 'simon-willison',
    name: 'Simon Willison',
    url: 'https://simonwillison.net/atom/everything/',
    trust: 'expert',
    angle: 'practical developer tools, LLM tools, open source',
    defaultTags: ['llm', 'tools', 'open-source'],
  },
  {
    source: 'import-ai',
    name: 'Import AI (Jack Clark)',
    url: 'https://importai.substack.com/feed',
    trust: 'expert',
    angle: 'AI research, policy, safety',
    defaultTags: ['ai-research', 'policy', 'safety'],
  },
  {
    source: 'alphasignal',
    name: 'AlphaSignal',
    url: 'https://alphasignalai.substack.com/feed',
    trust: 'expert',
    angle: 'bleeding-edge research, papers-first',
    defaultTags: ['ai-research', 'papers'],
  },
  {
    source: 'last-week-ai',
    name: 'Last Week in AI',
    url: 'https://lastweekin.ai/feed',
    trust: 'expert',
    angle: 'balanced weekly AI roundup',
    defaultTags: ['ai', 'weekly-roundup'],
  },
  {
    source: 'ahead-of-ai',
    name: 'Ahead of AI (Raschka)',
    url: 'https://magazine.sebastianraschka.com/feed',
    trust: 'expert',
    angle: 'ML research, academic, fundamentals',
    defaultTags: ['ml-research', 'academic'],
  },
  {
    source: 'marktechpost',
    name: 'MarkTechPost',
    url: 'https://www.marktechpost.com/feed/',
    trust: 'expert',
    angle: 'accessible research coverage',
    defaultTags: ['ai-research', 'summaries'],
  },
  {
    source: 'github-trending',
    name: 'GitHub Trending',
    url: 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml',
    trust: 'algorithm',
    angle: 'what developers are building, code not talk',
    defaultTags: ['github', 'open-source'],
  },
  {
    source: 'hf-papers',
    name: 'HuggingFace Papers',
    url: 'https://papers.takara.ai/api/feed',
    trust: 'crowd',
    angle: 'ML papers trending in research community',
    defaultTags: ['ml-papers', 'research'],
  },
  {
    source: 'openai-news',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    trust: 'primary',
    angle: 'first-party OpenAI announcements',
    defaultTags: ['openai', 'announcements'],
  },
  {
    source: 'google-research',
    name: 'Google Research',
    url: 'https://research.google/blog/rss/',
    trust: 'primary',
    angle: 'first-party Google AI research',
    defaultTags: ['google', 'ai-research'],
  },
  {
    source: 'bair',
    name: 'BAIR',
    url: 'https://bair.berkeley.edu/blog/feed.xml',
    trust: 'primary',
    angle: 'academic, cutting-edge Berkeley AI research',
    defaultTags: ['academic', 'ai-research'],
  },
];

function hashId(source: string, link: string): string {
  const hash = createHash('sha256').update(link).digest('hex').slice(0, 12);
  return `${source}-${hash}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(title: string): string[] {
  const stopwords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'and', 'but',
    'or', 'not', 'no', 'so', 'if', 'than', 'too', 'very', 'just', 'how',
    'what', 'when', 'where', 'why', 'who', 'which', 'that', 'this', 'it',
    'its', 'my', 'your', 'his', 'her', 'our', 'their', 'new', 'now',
  ]);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w))
    .slice(0, 5);
}

interface ParsedItem {
  title: string;
  link: string;
  content: string;
  published: string;
  author: string;
}

function parseRssItems(feed: Record<string, unknown>): ParsedItem[] {
  // RSS 2.0: rss.channel.item
  const channel = (feed as any)?.rss?.channel;
  if (channel) {
    const items = channel.item ?? [];
    const itemList = Array.isArray(items) ? items : [items];
    return itemList.map((item: any) => ({
      title: stripHtml(String(item.title ?? '')),
      link: String(item.link ?? item.guid ?? ''),
      content: stripHtml(String(item.description ?? item['content:encoded'] ?? '')),
      published: String(item.pubDate ?? ''),
      author: String(item.author ?? item['dc:creator'] ?? ''),
    }));
  }
  return [];
}

function parseAtomEntries(feed: Record<string, unknown>): ParsedItem[] {
  // Atom: feed.entry
  const atomFeed = (feed as any)?.feed;
  if (atomFeed) {
    const entries = atomFeed.entry ?? [];
    const entryList = Array.isArray(entries) ? entries : [entries];
    return entryList.map((entry: any) => {
      // Atom links can be objects or arrays
      let link = '';
      if (entry.link) {
        if (Array.isArray(entry.link)) {
          const alt = entry.link.find((l: any) => l['@_rel'] === 'alternate');
          link = alt?.['@_href'] ?? entry.link[0]?.['@_href'] ?? '';
        } else if (typeof entry.link === 'object') {
          link = entry.link['@_href'] ?? '';
        } else {
          link = String(entry.link);
        }
      }

      // Atom author can be object or array
      let author = '';
      if (entry.author) {
        if (Array.isArray(entry.author)) {
          author = entry.author.map((a: any) => a.name ?? '').filter(Boolean).join(', ');
        } else {
          author = entry.author.name ?? '';
        }
      }

      // Content can be in content or summary
      const content = entry.content?.['#text'] ?? entry.content ?? entry.summary?.['#text'] ?? entry.summary ?? '';

      return {
        title: stripHtml(String(entry.title?.['#text'] ?? entry.title ?? '')),
        link,
        content: stripHtml(String(content)),
        published: String(entry.published ?? entry.updated ?? ''),
        author,
      };
    });
  }
  return [];
}

export function parseFeed(xml: string): ParsedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: true,
  });
  const feed = parser.parse(xml);

  // Try RSS first, then Atom
  const rssItems = parseRssItems(feed);
  if (rssItems.length > 0) return rssItems;

  return parseAtomEntries(feed);
}

async function scrapeSingleFeed(config: FeedConfig): Promise<ScraperResult> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    const res = await fetch(config.url, {
      headers: { 'User-Agent': 'deeptrend/0.3.0' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      errors.push(`${config.name} RSS returned ${res.status}`);
      return { source: config.source as RawSignal['source'], signals, errors };
    }

    const xml = await res.text();
    const items = parseFeed(xml);

    const seen = new Set<string>();
    for (const item of items) {
      if (!item.title || !item.link) continue;

      const sourceId = hashId(config.source, item.link);
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);

      const keywords = extractKeywords(item.title);
      const tags = [...new Set([...config.defaultTags, ...keywords])];

      signals.push({
        source: config.source as RawSignal['source'],
        source_id: sourceId,
        title: item.title,
        content: item.content || item.title,
        url: item.link,
        author: item.author || config.name,
        author_type: 'human',
        score: 0,
        tags,
        published_at: item.published
          ? new Date(item.published).toISOString()
          : new Date().toISOString(),
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`${config.name} scrape failed: ${msg}`);
  }

  return { source: config.source as RawSignal['source'], signals, errors };
}

export async function scrapeCuratedFeeds(
  feeds: FeedConfig[] = CURATED_FEEDS,
): Promise<ScraperResult[]> {
  // Scrape all feeds concurrently with individual error isolation
  const results = await Promise.all(feeds.map((feed) => scrapeSingleFeed(feed)));
  return results;
}
