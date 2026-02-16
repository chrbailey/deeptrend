import { Feed } from 'feed';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Insight } from '../scrapers/types.js';
import { CURATED_FEEDS, type TrustTier } from '../scrapers/curated-feeds.js';

const SITE_TITLE = 'deeptrend — AI Trend Intelligence';
const SITE_DESCRIPTION = 'Curated from 14+ sources, synthesized via LLM Counsel, published for agent consumption.';
const SITE_URL = 'https://deeptrend.dev'; // placeholder — configurable later

// Trust map for convergence metadata
const SOURCE_TRUST: Record<string, TrustTier | 'raw'> = {
  'google-trends': 'raw',
  'reddit': 'raw',
  'arxiv': 'raw',
  'moltbook': 'raw',
  'twitter': 'raw',
};
for (const feed of CURATED_FEEDS) {
  SOURCE_TRUST[feed.source] = feed.trust;
}

export interface PublishResult {
  files: string[];
  errors: string[];
}

interface DeeptrendExtension {
  priority: string;
  insight_type: string;
  confidence: number;
  convergence?: {
    source_count: number;
    sources: string[];
    trust_tiers: Record<string, number>;
  };
}

function buildConvergence(insight: Insight): DeeptrendExtension['convergence'] {
  if (!insight.sources || insight.sources.length === 0) return undefined;

  const tierCounts: Record<string, number> = {};
  for (const src of insight.sources) {
    const tier = String(SOURCE_TRUST[src] ?? 'raw');
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  return {
    source_count: insight.sources.length,
    sources: insight.sources,
    trust_tiers: tierCounts,
  };
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function generateLlmsTxt(insights: Insight[], date: Date): string {
  const dateStr = formatDate(date);
  const p0Count = insights.filter((i) => i.priority === 'p0').length;
  const p1Count = insights.filter((i) => i.priority === 'p1').length;

  return `# deeptrend

> ${SITE_DESCRIPTION}
> Updated every 6 hours.

## Latest Insights

- [${dateStr} Analysis](/insights/${dateStr}.md): ${insights.length} insights, ${p0Count} p0, ${p1Count} p1

## Feeds

- [JSON Feed](/feed.json): All insights as structured JSON (recommended for agents)
- [RSS Feed](/feed.xml): Standard RSS 2.0 feed

## Archive

- [${dateStr}](/insights/${dateStr}.md)
`;
}

export function generateJsonFeed(insights: Insight[], date: Date): string {
  const dateStr = formatDate(date);

  const items = insights.map((insight, i) => {
    const ext: DeeptrendExtension = {
      priority: insight.priority ?? 'p2',
      insight_type: insight.insight_type,
      confidence: insight.confidence,
      convergence: buildConvergence(insight),
    };

    return {
      id: `${dateStr}-insight-${i + 1}`,
      title: insight.topic,
      content_text: insight.summary,
      date_published: date.toISOString(),
      tags: [insight.priority ?? 'p2', insight.insight_type, ...(insight.sources ?? [])],
      _deeptrend: ext,
    };
  });

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: SITE_TITLE,
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: SITE_DESCRIPTION,
    items,
  };

  return JSON.stringify(feed, null, 2);
}

export function generateRssFeed(insights: Insight[], date: Date): string {
  const feed = new Feed({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    id: SITE_URL,
    link: SITE_URL,
    language: 'en',
    updated: date,
    generator: 'deeptrend v0.3.0',
    feedLinks: {
      json: `${SITE_URL}/feed.json`,
      rss: `${SITE_URL}/feed.xml`,
    },
  });

  for (const [i, insight] of insights.entries()) {
    const dateStr = formatDate(date);
    feed.addItem({
      title: `[${insight.priority ?? 'p2'}] ${insight.topic}`,
      id: `${SITE_URL}/insights/${dateStr}#insight-${i + 1}`,
      link: `${SITE_URL}/insights/${dateStr}.md`,
      description: insight.summary,
      date,
      category: [
        { name: insight.priority ?? 'p2' },
        { name: insight.insight_type },
      ],
    });
  }

  return feed.rss2();
}

export function generateInsightMarkdown(insights: Insight[], date: Date): string {
  const dateStr = formatDate(date);
  const p0 = insights.filter((i) => i.priority === 'p0');
  const p1 = insights.filter((i) => i.priority === 'p1');
  const p2 = insights.filter((i) => i.priority === 'p2');

  const convergenceTopics = p0.map((i) => i.topic);

  // YAML frontmatter
  let md = `---
date: ${dateStr}
version: "3.0"
sources_active: ${new Set(insights.flatMap((i) => i.sources ?? [])).size || 'unknown'}
insights_count: ${insights.length}
p0_count: ${p0.length}
p1_count: ${p1.length}
p2_count: ${p2.length}
convergence_topics: ${JSON.stringify(convergenceTopics)}
---

# deeptrend Analysis — ${dateStr}

`;

  const renderGroup = (priority: string, group: Insight[]) => {
    for (const insight of group) {
      const sourceCount = insight.sources?.length ?? 0;
      md += `## ${priority}: ${insight.topic}\n\n`;
      md += `**Type:** ${insight.insight_type} | **Confidence:** ${insight.confidence}`;
      if (sourceCount > 0) {
        md += ` | **Sources:** ${sourceCount}`;
      }
      md += '\n\n';

      md += `${insight.summary}\n\n`;

      if (insight.sources && insight.sources.length > 0) {
        md += `**Contributing sources:** ${insight.sources.join(', ')}\n\n`;
      }

      if (insight.convergence_tiers && insight.convergence_tiers.length > 0) {
        md += `**Trust tier convergence:** ${insight.convergence_tiers.join(', ')}\n\n`;
      }
    }
  };

  if (p0.length > 0) renderGroup('p0', p0);
  if (p1.length > 0) renderGroup('p1', p1);
  if (p2.length > 0) renderGroup('p2', p2);

  return md;
}

export async function publishSite(
  insights: Insight[],
  outputDir: string,
  date?: Date,
): Promise<PublishResult> {
  const now = date ?? new Date();
  const dateStr = formatDate(now);
  const files: string[] = [];
  const errors: string[] = [];

  try {
    // Create output directories
    await mkdir(join(outputDir, 'insights'), { recursive: true });

    // Generate and write all files
    const llmsTxt = generateLlmsTxt(insights, now);
    const llmsPath = join(outputDir, 'llms.txt');
    await writeFile(llmsPath, llmsTxt, 'utf-8');
    files.push(llmsPath);

    const jsonFeed = generateJsonFeed(insights, now);
    const jsonPath = join(outputDir, 'feed.json');
    await writeFile(jsonPath, jsonFeed, 'utf-8');
    files.push(jsonPath);

    const rssFeed = generateRssFeed(insights, now);
    const rssPath = join(outputDir, 'feed.xml');
    await writeFile(rssPath, rssFeed, 'utf-8');
    files.push(rssPath);

    const markdown = generateInsightMarkdown(insights, now);
    const mdPath = join(outputDir, 'insights', `${dateStr}.md`);
    await writeFile(mdPath, markdown, 'utf-8');
    files.push(mdPath);
  } catch (err) {
    errors.push(`Publish failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { files, errors };
}
