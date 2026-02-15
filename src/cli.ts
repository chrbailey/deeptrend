import 'dotenv/config';
import { Command } from 'commander';
import { scrapeGoogleTrends, scrapeReddit, scrapeArxiv, scrapeMoltbook, scrapeTwitter, loginToTwitter } from './scrapers/index.js';
import { upsertSignals, updateSignalVelocity } from './db/supabase.js';
import { runAnalysis, runResearch } from './analyzer/analyze.js';
import { computeVelocity } from './scoring/velocity.js';
import type { ScraperResult } from './scrapers/types.js';

const program = new Command();

program
  .name('deeptrend')
  .description('Trend intelligence pipeline — scrapes, analyzes, researches')
  .version('0.2.0');

program
  .command('scrape')
  .description('Scrape all sources and store raw signals in Supabase')
  .option('--source <source>', 'Scrape a specific source only (google-trends, reddit, arxiv, moltbook, twitter)')
  .option('--headed', 'Run browser scrapers in headed mode (visible window)')
  .action(async (opts: { source?: string; headed?: boolean }) => {
    console.log('Starting scrape...');
    const start = Date.now();

    const scrapers: Array<{ name: string; fn: () => Promise<ScraperResult> }> = [
      { name: 'google-trends', fn: scrapeGoogleTrends },
      { name: 'reddit', fn: scrapeReddit },
      { name: 'arxiv', fn: scrapeArxiv },
      { name: 'moltbook', fn: scrapeMoltbook },
      { name: 'twitter', fn: () => scrapeTwitter({ headed: opts.headed }) },
    ];

    const toRun = opts.source
      ? scrapers.filter((s) => s.name === opts.source)
      : scrapers;

    if (toRun.length === 0) {
      console.error(`Unknown source: ${opts.source}`);
      process.exit(1);
    }

    let totalSignals = 0;
    let totalInserted = 0;
    const allErrors: string[] = [];

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

    if (allErrors.length > 0) {
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Run Claude analysis on recent signals')
  .action(async () => {
    console.log('Starting analysis...');
    const start = Date.now();

    const { insights, errors } = await runAnalysis();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s: ${insights.length} insights generated`);

    if (insights.length > 0) {
      console.log('\nTop insights:');
      for (const insight of insights.slice(0, 5)) {
        const prio = insight.priority ? `[${insight.priority}]` : '';
        console.log(`  ${prio}[${insight.insight_type}] ${insight.topic} (confidence: ${insight.confidence})`);
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
