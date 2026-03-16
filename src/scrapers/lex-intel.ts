/**
 * Lex Intel bridge scraper — reads Chinese AI news from lex-cache.json
 * and converts to deeptrend RawSignal format.
 *
 * lex-cache.json is produced by ~/.claude/scripts/lex-scrape.py
 * on a launchd schedule (11 PM Pacific / 7 AM China time).
 */

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { RawSignal, ScraperResult } from './types.js';

interface LexArticle {
  source: string;
  title: string;
  url: string;
  body_preview?: string;
  published?: string;
  english_title?: string;
  category?: string;
  relevance?: number;
}

interface LexCache {
  scraped_at: string;
  articles: LexArticle[];
  article_count: number;
  sources_ok: string[];
  sources_failed: string[];
}

const LEX_CACHE_PATH = join(homedir(), '.claude', 'lex-cache.json');

// Staleness: ignore cache older than 48 hours
const MAX_CACHE_AGE_MS = 48 * 60 * 60 * 1000;

export async function scrapeLexIntel(): Promise<ScraperResult> {
  const errors: string[] = [];
  const signals: RawSignal[] = [];

  try {
    const raw = await readFile(LEX_CACHE_PATH, 'utf-8');
    const cache: LexCache = JSON.parse(raw);

    // Check staleness
    const scrapedAt = new Date(cache.scraped_at).getTime();
    if (Date.now() - scrapedAt > MAX_CACHE_AGE_MS) {
      errors.push(`lex-cache.json is stale (scraped ${cache.scraped_at})`);
      return { source: 'lex-intel', signals: [], errors };
    }

    for (const article of cache.articles) {
      // Use english_title if available, otherwise original Chinese title
      const title = article.english_title || article.title;
      const content = article.body_preview
        ? article.body_preview.replace(/<[^>]*>/g, '').slice(0, 500)
        : '';

      signals.push({
        source: 'lex-intel',
        source_id: `lex-${article.source}-${Buffer.from(article.url).toString('base64url').slice(0, 16)}`,
        title,
        content: content || title,
        url: article.url,
        author: article.source,
        author_type: 'human',
        score: article.relevance ?? 3,
        tags: [
          'china',
          article.source,
          ...(article.category ? [article.category] : []),
        ],
        published_at: article.published
          ? new Date(article.published).toISOString()
          : cache.scraped_at,
      });
    }

    if (cache.sources_failed.length > 0) {
      errors.push(`Failed sources: ${cache.sources_failed.join(', ')}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) {
      errors.push('lex-cache.json not found — run lex scrape first');
    } else {
      errors.push(`lex-intel error: ${msg}`);
    }
  }

  return { source: 'lex-intel', signals, errors };
}
