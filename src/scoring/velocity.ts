import { getClient } from '../db/supabase.js';

export interface VelocityScore {
  topic: string;
  current_count: number;
  previous_count: number;
  velocity: number; // percentage change (-100 to +Infinity)
  is_hot: boolean;  // >50% increase
}

/**
 * Count signals per tag within a time window.
 * Returns a map of tag -> count.
 */
async function getTagCounts(since: Date, until: Date): Promise<Record<string, number>> {
  const db = getClient();
  const { data, error } = await db
    .from('raw_signals')
    .select('tags')
    .gte('scraped_at', since.toISOString())
    .lt('scraped_at', until.toISOString());

  if (error) throw new Error(`Failed to fetch signal tags: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const tags = row.tags as string[];
    for (const tag of tags) {
      const normalized = tag.toLowerCase();
      counts[normalized] = (counts[normalized] ?? 0) + 1;
    }
  }

  return counts;
}

/**
 * Compute velocity scores by comparing signal tag counts between
 * the current time window and the previous window of the same size.
 *
 * @param windowHours Size of each comparison window (default: 4 hours)
 * @param now Reference time (default: current time, overridable for testing)
 */
export async function computeVelocity(windowHours = 4, now?: Date): Promise<VelocityScore[]> {
  const reference = now ?? new Date();

  const currentEnd = reference;
  const currentStart = new Date(reference.getTime() - windowHours * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - windowHours * 60 * 60 * 1000);

  const [currentCounts, previousCounts] = await Promise.all([
    getTagCounts(currentStart, currentEnd),
    getTagCounts(previousStart, currentStart),
  ]);

  // Merge all topics from both windows
  const allTopics = new Set([...Object.keys(currentCounts), ...Object.keys(previousCounts)]);

  const scores: VelocityScore[] = [];
  for (const topic of allTopics) {
    const current = currentCounts[topic] ?? 0;
    const previous = previousCounts[topic] ?? 0;

    // Skip topics with zero signals in both windows
    if (current === 0 && previous === 0) continue;

    let velocity: number;
    if (previous === 0) {
      // New topic — treat as 100% increase if there are current signals
      velocity = current > 0 ? 100 : 0;
    } else {
      velocity = ((current - previous) / previous) * 100;
    }

    scores.push({
      topic,
      current_count: current,
      previous_count: previous,
      velocity: Math.round(velocity * 10) / 10, // Round to 1 decimal
      is_hot: velocity > 50,
    });
  }

  // Sort by velocity descending
  scores.sort((a, b) => b.velocity - a.velocity);

  return scores;
}

/**
 * Format hot topics for inclusion in the analysis prompt.
 */
export function formatHotTopics(scores: VelocityScore[]): string {
  const hot = scores.filter((s) => s.is_hot);
  if (hot.length === 0) return '';

  const lines = hot
    .slice(0, 10) // Cap at 10 hot topics
    .map((s) => `- "${s.topic}" velocity +${s.velocity}% (${s.previous_count} → ${s.current_count} signals)`);

  return `\n### Hot Topics (velocity >50% vs previous window)\n${lines.join('\n')}\n`;
}
