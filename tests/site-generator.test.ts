import { describe, it, expect, vi } from 'vitest';
import {
  generateLlmsTxt,
  generateJsonFeed,
  generateRssFeed,
  generateInsightMarkdown,
  publishSite,
} from '../src/publisher/site-generator.js';
import type { Insight } from '../src/scrapers/types.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testDate = new Date('2026-02-16T06:00:00Z');

const testInsights: Insight[] = [
  {
    insight_type: 'trend',
    topic: 'Claude 4.5 Release',
    summary: 'Major model release with improved reasoning. Cross-bias convergence across 5 sources.',
    sources: ['techmeme', 'hn-digest', 'simon-willison', 'alphasignal', 'openai-news'],
    confidence: 0.92,
    priority: 'p0',
    convergence_tiers: ['editor', 'crowd', 'expert', 'primary'],
  },
  {
    insight_type: 'consensus',
    topic: 'vLLM Performance',
    summary: 'Growing consensus around vLLM as the inference standard.',
    sources: ['github-trending', 'hf-papers'],
    confidence: 0.78,
    priority: 'p1',
    convergence_tiers: ['algorithm', 'crowd'],
  },
  {
    insight_type: 'tool_mention',
    topic: 'MCP Protocol Adoption',
    summary: 'Emerging tool mention across developer blogs.',
    sources: ['simon-willison'],
    confidence: 0.65,
    priority: 'p2',
  },
];

describe('llms.txt generation', () => {
  it('produces valid llms.txt format', () => {
    const txt = generateLlmsTxt(testInsights, testDate);

    expect(txt).toContain('# deeptrend');
    expect(txt).toContain('Updated every 6 hours');
    expect(txt).toContain('2026-02-16');
    expect(txt).toContain('3 insights');
    expect(txt).toContain('1 p0');
    expect(txt).toContain('1 p1');
  });

  it('includes feed links', () => {
    const txt = generateLlmsTxt(testInsights, testDate);

    expect(txt).toContain('/feed.json');
    expect(txt).toContain('/feed.xml');
    expect(txt).toContain('recommended for agents');
  });

  it('includes archive link', () => {
    const txt = generateLlmsTxt(testInsights, testDate);

    expect(txt).toContain('/insights/2026-02-16.md');
  });
});

describe('JSON Feed generation', () => {
  it('produces valid JSON Feed 1.1', () => {
    const json = generateJsonFeed(testInsights, testDate);
    const feed = JSON.parse(json);

    expect(feed.version).toBe('https://jsonfeed.org/version/1.1');
    expect(feed.title).toContain('deeptrend');
    expect(feed.items).toHaveLength(3);
  });

  it('includes _deeptrend extensions on items', () => {
    const json = generateJsonFeed(testInsights, testDate);
    const feed = JSON.parse(json);
    const item = feed.items[0];

    expect(item._deeptrend).toBeDefined();
    expect(item._deeptrend.priority).toBe('p0');
    expect(item._deeptrend.insight_type).toBe('trend');
    expect(item._deeptrend.confidence).toBe(0.92);
  });

  it('includes convergence data for multi-source insights', () => {
    const json = generateJsonFeed(testInsights, testDate);
    const feed = JSON.parse(json);
    const item = feed.items[0];

    expect(item._deeptrend.convergence).toBeDefined();
    expect(item._deeptrend.convergence.source_count).toBe(5);
    expect(item._deeptrend.convergence.sources).toContain('techmeme');
    expect(item._deeptrend.convergence.trust_tiers.editor).toBe(1);
    expect(item._deeptrend.convergence.trust_tiers.expert).toBe(2);
  });

  it('omits convergence for insights without sources', () => {
    const noSources: Insight[] = [{
      insight_type: 'gap',
      topic: 'Missing Topic',
      summary: 'Not in any feed.',
      sources: [],
      confidence: 0.5,
      priority: 'p2',
    }];

    const json = generateJsonFeed(noSources, testDate);
    const feed = JSON.parse(json);

    expect(feed.items[0]._deeptrend.convergence).toBeUndefined();
  });

  it('includes tags with priority and type', () => {
    const json = generateJsonFeed(testInsights, testDate);
    const feed = JSON.parse(json);
    const item = feed.items[0];

    expect(item.tags).toContain('p0');
    expect(item.tags).toContain('trend');
    expect(item.tags).toContain('techmeme');
  });

  it('generates stable item IDs', () => {
    const json = generateJsonFeed(testInsights, testDate);
    const feed = JSON.parse(json);

    expect(feed.items[0].id).toBe('2026-02-16-insight-1');
    expect(feed.items[1].id).toBe('2026-02-16-insight-2');
    expect(feed.items[2].id).toBe('2026-02-16-insight-3');
  });
});

describe('RSS 2.0 generation', () => {
  it('produces valid RSS 2.0 XML', () => {
    const xml = generateRssFeed(testInsights, testDate);

    expect(xml).toContain('<?xml');
    expect(xml).toContain('<rss');
    expect(xml).toContain('version="2.0"');
    expect(xml).toContain('<channel>');
  });

  it('includes all insights as items', () => {
    const xml = generateRssFeed(testInsights, testDate);

    expect(xml).toContain('[p0] Claude 4.5 Release');
    expect(xml).toContain('[p1] vLLM Performance');
    expect(xml).toContain('[p2] MCP Protocol Adoption');
  });

  it('includes self-referencing atom:link', () => {
    const xml = generateRssFeed(testInsights, testDate);

    expect(xml).toContain('atom:link');
    expect(xml).toContain('feed.xml');
  });
});

describe('Insight markdown generation', () => {
  it('includes YAML frontmatter', () => {
    const md = generateInsightMarkdown(testInsights, testDate);

    expect(md).toMatch(/^---\n/);
    expect(md).toContain('date: 2026-02-16');
    expect(md).toContain('version: "3.0"');
    expect(md).toContain('insights_count: 3');
    expect(md).toContain('p0_count: 1');
    expect(md).toContain('p1_count: 1');
    expect(md).toContain('p2_count: 1');
  });

  it('includes convergence_topics in frontmatter', () => {
    const md = generateInsightMarkdown(testInsights, testDate);

    expect(md).toContain('convergence_topics: ["Claude 4.5 Release"]');
  });

  it('groups insights by priority', () => {
    const md = generateInsightMarkdown(testInsights, testDate);

    const p0Pos = md.indexOf('## p0:');
    const p1Pos = md.indexOf('## p1:');
    const p2Pos = md.indexOf('## p2:');

    expect(p0Pos).toBeGreaterThan(-1);
    expect(p1Pos).toBeGreaterThan(p0Pos);
    expect(p2Pos).toBeGreaterThan(p1Pos);
  });

  it('includes source and convergence details', () => {
    const md = generateInsightMarkdown(testInsights, testDate);

    expect(md).toContain('**Contributing sources:** techmeme, hn-digest');
    expect(md).toContain('**Trust tier convergence:** editor, crowd, expert, primary');
  });

  it('includes confidence and type metadata', () => {
    const md = generateInsightMarkdown(testInsights, testDate);

    expect(md).toContain('**Type:** trend');
    expect(md).toContain('**Confidence:** 0.92');
    expect(md).toContain('**Sources:** 5');
  });
});

describe('publishSite (filesystem)', () => {
  let tmpDir: string;

  it('writes all four files to output directory', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'deeptrend-test-'));

    try {
      const result = await publishSite(testInsights, tmpDir, testDate);

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(5);

      // Verify files exist and have content
      const llmsTxt = await readFile(join(tmpDir, 'llms.txt'), 'utf-8');
      expect(llmsTxt).toContain('# deeptrend');

      const jsonFeed = await readFile(join(tmpDir, 'feed.json'), 'utf-8');
      const parsed = JSON.parse(jsonFeed);
      expect(parsed.version).toContain('jsonfeed.org');

      const rssFeed = await readFile(join(tmpDir, 'feed.xml'), 'utf-8');
      expect(rssFeed).toContain('<rss');

      const markdown = await readFile(join(tmpDir, 'insights', '2026-02-16.md'), 'utf-8');
      expect(markdown).toContain('---');
      expect(markdown).toContain('Claude 4.5 Release');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates insights subdirectory automatically', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'deeptrend-test-'));

    try {
      const result = await publishSite(testInsights, tmpDir, testDate);

      expect(result.errors).toHaveLength(0);
      const mdFile = result.files.find((f) => f.endsWith('.md'));
      expect(mdFile).toContain('insights');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles empty insights array', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'deeptrend-test-'));

    try {
      const result = await publishSite([], tmpDir, testDate);

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(5);

      const jsonFeed = await readFile(join(tmpDir, 'feed.json'), 'utf-8');
      const parsed = JSON.parse(jsonFeed);
      expect(parsed.items).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
