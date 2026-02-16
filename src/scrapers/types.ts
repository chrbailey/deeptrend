export interface RawSignal {
  source: 'google-trends' | 'reddit' | 'arxiv' | 'moltbook' | 'twitter'
    | 'techmeme' | 'hn-digest' | 'simon-willison' | 'import-ai'
    | 'alphasignal' | 'last-week-ai' | 'ahead-of-ai' | 'marktechpost'
    | 'github-trending' | 'hf-papers' | 'openai-news' | 'google-research' | 'bair';
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
  insight_type: 'trend' | 'consensus' | 'divergence' | 'tool_mention' | 'gap';
  topic: string;
  summary: string;
  sources: string[];
  confidence: number; // 0-1
  priority?: 'p0' | 'p1' | 'p2';
  convergence_tiers?: string[];
}

export interface ScraperResult {
  source: RawSignal['source'];
  signals: RawSignal[];
  errors: string[];
}
