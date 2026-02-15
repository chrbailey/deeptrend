import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { RawSignal, Insight } from '../scrapers/types.js';

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
  }

  client = createClient(url, key);
  return client;
}

export async function upsertSignals(signals: RawSignal[]): Promise<{ inserted: number; errors: string[] }> {
  const db = getClient();
  const errors: string[] = [];
  let inserted = 0;

  // Batch upsert — Supabase handles ON CONFLICT via source + source_id unique constraint
  const rows = signals.map((s) => ({
    ...s,
    scraped_at: new Date().toISOString(),
  }));

  // Upsert in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error } = await db
      .from('raw_signals')
      .upsert(chunk, { onConflict: 'source,source_id', ignoreDuplicates: true })
      .select('id');

    if (error) {
      errors.push(`Upsert chunk ${i}: ${error.message}`);
    } else {
      inserted += data?.length ?? 0;
    }
  }

  return { inserted, errors };
}

export async function getSignalsSince(since: Date): Promise<RawSignal[]> {
  const db = getClient();
  const { data, error } = await db
    .from('raw_signals')
    .select('*')
    .gte('scraped_at', since.toISOString())
    .order('scraped_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`Failed to fetch signals: ${error.message}`);
  return data ?? [];
}

export async function getSignalsBySource(source: RawSignal['source'], limit = 100): Promise<RawSignal[]> {
  const db = getClient();
  const { data, error } = await db
    .from('raw_signals')
    .select('*')
    .eq('source', source)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch signals for ${source}: ${error.message}`);
  return data ?? [];
}

export async function insertInsights(insights: Insight[]): Promise<{ inserted: number; errors: string[] }> {
  const db = getClient();
  const errors: string[] = [];
  let inserted = 0;

  const rows = insights.map((i) => ({
    ...i,
    analyzed_at: new Date().toISOString(),
  }));

  const { data, error } = await db
    .from('insights')
    .insert(rows)
    .select('id');

  if (error) {
    errors.push(`Insert insights: ${error.message}`);
  } else {
    inserted = data?.length ?? 0;
  }

  return { inserted, errors };
}

export async function getLastAnalysisTime(): Promise<Date | null> {
  const db = getClient();
  const { data, error } = await db
    .from('insights')
    .select('analyzed_at')
    .order('analyzed_at', { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  return new Date(data[0].analyzed_at);
}

export async function searchInsights(query: string, limit = 10): Promise<Insight[]> {
  const db = getClient();
  // Text search fallback — pgvector semantic search requires embedding generation
  const { data, error } = await db
    .from('insights')
    .select('*')
    .or(`topic.ilike.%${query}%,summary.ilike.%${query}%`)
    .order('analyzed_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to search insights: ${error.message}`);
  return data ?? [];
}
