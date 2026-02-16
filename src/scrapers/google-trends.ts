import { XMLParser } from 'fast-xml-parser';
import type { RawSignal, ScraperResult } from './types.js';

const RSS_URL = 'https://trends.google.com/trending/rss?geo=US';

interface TrendItem {
  title: string;
  link: string;
  pubDate: string;
  'ht:approx_traffic'?: string;
  'ht:news_item'?: {
    'ht:news_item_title'?: string;
    'ht:news_item_url'?: string;
  } | Array<{
    'ht:news_item_title'?: string;
    'ht:news_item_url'?: string;
  }>;
}

function parseTraffic(traffic?: string): number {
  if (!traffic) return 0;
  // "200,000+" → 200000
  return parseInt(traffic.replace(/[,+]/g, ''), 10) || 0;
}

export async function scrapeGoogleTrends(): Promise<ScraperResult> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'deeptrend/0.1.0' },
    });

    if (!res.ok) {
      errors.push(`Google Trends RSS returned ${res.status}`);
      return { source: 'google-trends', signals, errors };
    }

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: true,
    });
    const feed = parser.parse(xml);

    const items: TrendItem[] = feed?.rss?.channel?.item ?? [];
    const itemList = Array.isArray(items) ? items : [items];

    for (const item of itemList) {
      if (!item.title) continue;

      const newsItems = item['ht:news_item'];
      let content = '';
      if (newsItems) {
        const newsList = Array.isArray(newsItems) ? newsItems : [newsItems];
        content = newsList
          .map((n) => n['ht:news_item_title'] ?? '')
          .filter(Boolean)
          .join('; ');
      }

      signals.push({
        source: 'google-trends',
        source_id: `gt-${item.title.toLowerCase().replace(/\s+/g, '-')}`,
        title: item.title,
        content: content || item.title,
        url: item.link || RSS_URL,
        author: 'google-trends',
        author_type: 'human',
        score: parseTraffic(item['ht:approx_traffic']),
        tags: ['trending'],
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      });
    }
  } catch (err) {
    errors.push(`Google Trends scrape failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { source: 'google-trends', signals, errors };
}
