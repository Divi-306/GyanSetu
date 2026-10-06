import { coverage, terms, unique } from './text';
import type { Chunk, TopicContent } from './types';

export type Hit = { chunk: Chunk; score: number; coverage: number };
/** exactTitle: the phrase essentially *is* the topic's title ("explain subnetting"), not just mentions it. */
export type TopicMatch = { topicId: string; score: number; coverage: number; byName: boolean; exactTitle: boolean };

type Doc = { chunk: Chunk; tf: Map<string, number>; len: number; terms: Set<string> };

/**
 * BM25 search over one pack's chunks, built once per tutor session (a pack has
 * a few hundred chunks, so this stays well under a few milliseconds per query).
 *
 * Grounding is decided by *coverage* — the share of the question's content words
 * found in the chunk or its topic's title/keywords — not by the raw score, so a
 * single common word can't make an unrelated paragraph look like an answer.
 */
export class PackIndex {
  private docs: Doc[];
  private avgLen: number;
  private df = new Map<string, number>();
  /** Title + keyword terms per topic: a match there counts for every chunk of the topic. */
  private topicTerms = new Map<string, Set<string>>();
  private titleTerms = new Map<string, string[]>();

  constructor(chunks: Chunk[], topics: Pick<TopicContent, 'id' | 'title' | 'keywords'>[]) {
    for (const t of topics) {
      const title = unique(terms(t.title));
      this.titleTerms.set(t.id, title);
      this.topicTerms.set(t.id, new Set([...title, ...t.keywords.flatMap((k) => terms(k))]));
    }
    this.docs = chunks.map((chunk) => {
      const toks = terms(`${chunk.label} ${chunk.text}`);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { chunk, tf, len: toks.length, terms: new Set(tf.keys()) };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, opts: { topicId?: string; limit?: number; exclude?: Set<number> } = {}): Hit[] {
    const q = unique(terms(query));
    if (q.length === 0) return [];
    const n = this.docs.length;
    const k1 = 1.2;
    const b = 0.75;
    const hits: Hit[] = [];
    for (const d of this.docs) {
      if (opts.topicId && d.chunk.topicId !== opts.topicId) continue;
      if (opts.exclude?.has(d.chunk.id)) continue;
      let score = 0;
      for (const t of q) {
        const f = d.tf.get(t) ?? 0;
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen)));
      }
      const topicSet = d.chunk.topicId ? this.topicTerms.get(d.chunk.topicId) : undefined;
      const seen = topicSet ? new Set([...d.terms, ...topicSet]) : d.terms;
      const cov = coverage(q, seen);
      if (score > 0 || cov > 0) hits.push({ chunk: d.chunk, score: score + cov, coverage: cov });
    }
    return hits.sort((x, y) => y.score - x.score).slice(0, opts.limit ?? 5);
  }

  /**
   * The topic a phrase names ("subnetting", "dijkstra's algorithm"), by title and
   * keywords first, then by content. Null when nothing covers at least half of it.
   */
  findTopic(phrase: string): TopicMatch | null {
    const q = unique(terms(phrase));
    if (q.length === 0) return null;

    let best: TopicMatch | null = null;
    for (const [topicId, set] of this.topicTerms) {
      const cov = coverage(q, set);
      const title = this.titleTerms.get(topicId) ?? [];
      // All of the title's words were said: strong evidence even if extra words were too.
      const titleCov = title.length ? coverage(title, new Set(q)) : 0;
      const score = cov + titleCov;
      if ((cov >= 0.6 || titleCov === 1) && (!best || score > best.score)) {
        const exactTitle = titleCov === 1 && coverage(q, new Set(title)) >= 0.75;
        best = { topicId, score, coverage: Math.max(cov, titleCov), byName: true, exactTitle };
      }
    }
    if (best) return best;

    // Not a title: the topic whose content best covers the phrase.
    const [top] = this.search(phrase, { limit: 1 });
    if (top && top.coverage >= 0.5 && top.chunk.topicId) {
      return { topicId: top.chunk.topicId, score: top.score, coverage: top.coverage, byName: false, exactTitle: false };
    }
    return null;
  }
}
