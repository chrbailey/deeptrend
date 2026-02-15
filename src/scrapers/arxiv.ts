import { XMLParser } from 'fast-xml-parser';
import type { RawSignal, ScraperResult } from './types.js';

const ARXIV_API = 'http://export.arxiv.org/api/query';

// AI-related categories
const CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.MA'];

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  author: { name: string } | Array<{ name: string }>;
  link: { '@_href': string } | Array<{ '@_href': string }>;
  'arxiv:primary_category'?: { '@_term': string };
  category?: { '@_term': string } | Array<{ '@_term': string }>;
}

function getAuthors(author: ArxivEntry['author']): string {
  if (Array.isArray(author)) {
    return author.map((a) => a.name).join(', ');
  }
  return author?.name ?? 'unknown';
}

function getLink(link: ArxivEntry['link']): string {
  if (Array.isArray(link)) {
    return link[0]?.['@_href'] ?? '';
  }
  return link?.['@_href'] ?? '';
}

function getTags(entry: ArxivEntry): string[] {
  const tags: string[] = [];
  const primary = entry['arxiv:primary_category']?.['@_term'];
  if (primary) tags.push(primary);

  const cats = entry.category;
  if (cats) {
    const catList = Array.isArray(cats) ? cats : [cats];
    for (const c of catList) {
      const term = c['@_term'];
      if (term && !tags.includes(term)) tags.push(term);
    }
  }
  return tags;
}

export async function scrapeArxiv(): Promise<ScraperResult> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    // Search for recent papers across AI categories
    const query = CATEGORIES.map((c) => `cat:${c}`).join('+OR+');
    const url = `${ARXIV_API}?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=50`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'deeptrend/0.1.0' },
    });

    if (!res.ok) {
      errors.push(`arXiv API returned ${res.status}`);
      return { source: 'arxiv', signals, errors };
    }

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: true,
    });
    const feed = parser.parse(xml);

    const entries: ArxivEntry[] = feed?.feed?.entry ?? [];
    const entryList = Array.isArray(entries) ? entries : [entries];

    for (const entry of entryList) {
      if (!entry.title || !entry.id) continue;

      // Extract arXiv ID from the URL (e.g., "http://arxiv.org/abs/2402.12345v1" → "2402.12345")
      const arxivId = entry.id.split('/abs/').pop()?.replace(/v\d+$/, '') ?? entry.id;

      signals.push({
        source: 'arxiv',
        source_id: `arxiv-${arxivId}`,
        title: entry.title.replace(/\s+/g, ' ').trim(),
        content: entry.summary?.replace(/\s+/g, ' ').trim() ?? '',
        url: getLink(entry.link) || entry.id,
        author: getAuthors(entry.author),
        author_type: 'human',
        score: 0, // arXiv doesn't have a score; analysis can use citation count later
        tags: getTags(entry),
        published_at: new Date(entry.published).toISOString(),
      });
    }
  } catch (err) {
    errors.push(`arXiv scrape failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { source: 'arxiv', signals, errors };
}
