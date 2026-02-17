import 'dotenv/config';
import { Command } from 'commander';
import { scrapeGoogleTrends, scrapeReddit, scrapeArxiv, scrapeMoltbook, scrapeTwitter, loginToTwitter, scrapeCuratedFeeds } from './scrapers/index.js';
import { upsertSignals, updateSignalVelocity } from './db/supabase.js';
import { runAnalysis, runResearch } from './analyzer/analyze.js';
import { publishSite } from './publisher/site-generator.js';
import { computeVelocity } from './scoring/velocity.js';
import type { ScraperResult } from './scrapers/types.js';
import { resolve } from 'node:path';

const program = new Command();

program
  .name('deeptrend')
  .description('Trend intelligence pipeline — curated feeds, LLM Counsel analysis, agent-optimized publishing')
  .version('0.3.0');

program
  .command('scrape')
  .description('Scrape sources and store raw signals in Supabase')
  .option('--source <source>', 'Scrape a specific source only')
  .option('--curated-only', 'Scrape only curated RSS feeds (no browser, no API keys)')
  .option('--headed', 'Run browser scrapers in headed mode (visible window)')
  .action(async (opts: { source?: string; curatedOnly?: boolean; headed?: boolean }) => {
    console.log('Starting scrape...');
    const start = Date.now();

    let totalSignals = 0;
    let totalInserted = 0;
    const allErrors: string[] = [];

    if (opts.curatedOnly) {
      // Fast mode: curated RSS feeds only
      console.log('  Scraping curated feeds (13 RSS sources)...');
      const results = await scrapeCuratedFeeds();
      for (const result of results) {
        totalSignals += result.signals.length;
        allErrors.push(...result.errors);

        if (result.signals.length > 0) {
          const { inserted, errors } = await upsertSignals(result.signals);
          totalInserted += inserted;
          allErrors.push(...errors);
          console.log(`    ${result.source}: ${result.signals.length} scraped, ${inserted} stored`);
        } else if (result.errors.length > 0) {
          for (const err of result.errors) {
            console.error(`    ERROR (${result.source}): ${err}`);
          }
        }
      }
    } else {
      // API-based scrapers (no browser required)
      const apiScrapers: Array<{ name: string; fn: () => Promise<ScraperResult> }> = [
        { name: 'google-trends', fn: scrapeGoogleTrends },
        { name: 'reddit', fn: scrapeReddit },
        { name: 'arxiv', fn: scrapeArxiv },
        { name: 'moltbook', fn: scrapeMoltbook },
      ];

      // Twitter is opt-in only — requires --source twitter
      if (opts.source === 'twitter') {
        const toRun = [{ name: 'twitter', fn: () => scrapeTwitter({ headed: opts.headed }) }];
        for (const scraper of toRun) {
          console.log(`  Scraping ${scraper.name}...`);
          const result = await scraper.fn();
          totalSignals += result.signals.length;
          allErrors.push(...result.errors);
          if (result.signals.length > 0) {
            const { inserted, errors } = await upsertSignals(result.signals);
            totalInserted += inserted;
            allErrors.push(...errors);
            console.log(`    ${scraper.name}: ${result.signals.length} scraped, ${inserted} stored`);
          }
        }
      } else {
        // Run curated feeds + API scrapers
        const toRun = opts.source
          ? apiScrapers.filter((s) => s.name === opts.source)
          : apiScrapers;

        if (opts.source && toRun.length === 0) {
          console.error(`Unknown source: ${opts.source}. Use --source twitter for X/Twitter.`);
          process.exit(1);
        }

        // Curated feeds first (unless filtering to specific API source)
        if (!opts.source) {
          console.log('  Scraping curated feeds (13 RSS sources)...');
          const curatedResults = await scrapeCuratedFeeds();
          for (const result of curatedResults) {
            totalSignals += result.signals.length;
            allErrors.push(...result.errors);
            if (result.signals.length > 0) {
              const { inserted, errors } = await upsertSignals(result.signals);
              totalInserted += inserted;
              allErrors.push(...errors);
              console.log(`    ${result.source}: ${result.signals.length} scraped, ${inserted} stored`);
            } else if (result.errors.length > 0) {
              for (const err of result.errors) {
                console.error(`    ERROR (${result.source}): ${err}`);
              }
            }
          }
        }

        // Then API scrapers
        for (const scraper of toRun) {
          console.log(`  Scraping ${scraper.name}...`);
          const result = await scraper.fn();
          totalSignals += result.signals.length;
          allErrors.push(...result.errors);

          if (result.signals.length > 0) {
            const { inserted, errors } = await upsertSignals(result.signals);
            totalInserted += inserted;
            allErrors.push(...errors);
            console.log(`    ${scraper.name}: ${result.signals.length} scraped, ${inserted} stored`);
          } else {
            console.log(`    ${scraper.name}: 0 signals`);
          }

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              console.error(`    ERROR: ${err}`);
            }
          }
        }
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s: ${totalSignals} scraped, ${totalInserted} stored, ${allErrors.length} errors`);

    // Compute and persist velocity scores
    console.log('\nComputing velocity scores...');
    const velocityScores = await computeVelocity();
    const scrapeStart = new Date(start);
    let totalVelocityUpdates = 0;

    for (const score of velocityScores) {
      const { updated, error } = await updateSignalVelocity(score.topic, score.velocity, scrapeStart);
      if (error) {
        allErrors.push(`Velocity update for "${score.topic}": ${error}`);
      } else {
        totalVelocityUpdates += updated;
      }
    }

    console.log(`Velocity updates: ${totalVelocityUpdates} signals updated across ${velocityScores.length} topics`);

    if (totalSignals === 0 && allErrors.length > 0) {
      // Only fail if we got nothing — partial success is still success
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Run LLM Counsel analysis on recent signals')
  .action(async () => {
    console.log('Starting LLM Counsel analysis...');
    const start = Date.now();

    const { insights, errors } = await runAnalysis();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s: ${insights.length} insights generated`);

    if (insights.length > 0) {
      console.log('\nTop insights:');
      for (const insight of insights.slice(0, 5)) {
        const prio = insight.priority ? `[${insight.priority}]` : '';
        const sources = insight.sources?.length ? ` (${insight.sources.length} sources)` : '';
        console.log(`  ${prio}[${insight.insight_type}] ${insight.topic}${sources} (confidence: ${insight.confidence})`);
        console.log(`    ${insight.summary}\n`);
      }
    }

    if (errors.length > 0) {
      console.error('\nErrors:');
      for (const err of errors) {
        console.error(`  ${err}`);
      }
      process.exit(1);
    }
  });

program
  .command('publish')
  .description('Generate agent-optimized static site from latest insights')
  .option('--output <dir>', 'Output directory', 'public')
  .option('--serve', 'Start local HTTP server after generating')
  .action(async (opts: { output: string; serve?: boolean }) => {
    console.log('Publishing site...');
    const start = Date.now();

    // Get insights from the LATEST analysis run only (same analyzed_at timestamp)
    const { getClient } = await import('./db/supabase.js');
    const db = getClient();

    // First get the latest analysis timestamp
    const { data: latest } = await db
      .from('insights')
      .select('analyzed_at')
      .order('analyzed_at', { ascending: false })
      .limit(1);

    const latestTimestamp = latest?.[0]?.analyzed_at;
    if (!latestTimestamp) {
      console.log('No insights to publish. Run `deeptrend analyze` first.');
      return;
    }

    const { data: insights, error } = await db
      .from('insights')
      .select('*')
      .eq('analyzed_at', latestTimestamp)
      .order('confidence', { ascending: false });

    if (error) {
      console.error(`Failed to fetch insights: ${error.message}`);
      process.exit(1);
    }

    if (!insights || insights.length === 0) {
      console.log('No insights to publish. Run `deeptrend analyze` first.');
      return;
    }

    const outputDir = resolve(opts.output);
    const { files, errors } = await publishSite(insights, outputDir);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nPublished in ${elapsed}s:`);
    for (const f of files) {
      console.log(`  ${f}`);
    }

    if (errors.length > 0) {
      console.error('\nErrors:');
      for (const err of errors) {
        console.error(`  ${err}`);
      }
      process.exit(1);
    }

    if (opts.serve) {
      const { createServer } = await import('node:http');
      const { readFile } = await import('node:fs/promises');
      const { join, extname } = await import('node:path');

      const MIME: Record<string, string> = {
        '.json': 'application/json',
        '.xml': 'application/rss+xml',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.html': 'text/html',
      };

      const server = createServer(async (req, res) => {
        const urlPath = req.url === '/' ? '/llms.txt' : req.url ?? '/llms.txt';
        const filePath = join(outputDir, urlPath);

        try {
          const content = await readFile(filePath, 'utf-8');
          const ext = extname(filePath);
          res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'text/plain' });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      const port = 3000;
      server.listen(port, () => {
        console.log(`\nServing at http://localhost:${port}`);
        console.log('  /llms.txt    — agent discovery');
        console.log('  /feed.json   — JSON Feed 1.1');
        console.log('  /feed.xml    — RSS 2.0');
      });
    }
  });

program
  .command('research <topic>')
  .description('On-demand deep dive on a specific topic')
  .action(async (topic: string) => {
    console.log(`Researching "${topic}"...`);
    const start = Date.now();

    // First, scrape targeted data
    console.log('  Scraping fresh data...');
    const scrapers = [scrapeGoogleTrends, scrapeReddit, scrapeArxiv];
    for (const fn of scrapers) {
      const result = await fn();
      if (result.signals.length > 0) {
        await upsertSignals(result.signals);
      }
    }

    // Then analyze
    const { insights, errors } = await runResearch(topic);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s: ${insights.length} insights`);

    for (const insight of insights) {
      const prio = insight.priority ? `[${insight.priority}]` : '';
      console.log(`\n${prio}[${insight.insight_type}] ${insight.topic} (confidence: ${insight.confidence})`);
      console.log(`  ${insight.summary}`);
    }

    if (errors.length > 0) {
      console.error('\nErrors:');
      for (const err of errors) {
        console.error(`  ${err}`);
      }
      process.exit(1);
    }
  });

program
  .command('login')
  .description('Open browser for manual X/Twitter login — saves session to persistent Chrome profile')
  .action(async () => {
    await loginToTwitter();
  });

program
  .command('status')
  .description('Show current status — signal counts, last analysis time')
  .action(async () => {
    const { getClient, getLastAnalysisTime } = await import('./db/supabase.js');
    const db = getClient();

    const { count: signalCount } = await db
      .from('raw_signals')
      .select('*', { count: 'exact', head: true });

    const { count: insightCount } = await db
      .from('insights')
      .select('*', { count: 'exact', head: true });

    const lastAnalysis = await getLastAnalysisTime();

    console.log('deeptrend status:');
    console.log(`  Raw signals: ${signalCount ?? 0}`);
    console.log(`  Insights: ${insightCount ?? 0}`);
    console.log(`  Last analysis: ${lastAnalysis?.toISOString() ?? 'never'}`);
  });

program.parse();
