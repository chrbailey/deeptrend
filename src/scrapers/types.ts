export interface RawSignal {
  source: 'google-trends' | 'reddit' | 'arxiv' | 'moltbook' | 'twitter';
  source_id: string;
  title: string;
  content: string;
  url: string;
  author: string;
  author_type: 'human' | 'agent';
  score: number;
  tags: string[];
  published_at: string; // ISO 8601
  velocity?: number;
}

export interface Insight {
  insight_type: 'trend' | 'consensus' | 'divergence' | 'tool_mention';
  topic: string;
  summary: string;
  sources: string[]; // raw_signals IDs
  confidence: number; // 0-1
  priority?: 'p0' | 'p1' | 'p2';
}

export interface ScraperResult {
  source: RawSignal['source'];
  signals: RawSignal[];
  errors: string[];
}
