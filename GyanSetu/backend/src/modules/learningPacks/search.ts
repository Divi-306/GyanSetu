import type { LearningPackContent, Topic } from './pack.schema';

// Same word rule as the rest of the AI code: \p{M} keeps Devanagari vowel signs inside Hindi words.
export const tokenize = (s: string) => s.toLowerCase().match(/[\p{L}\p{M}\p{N}]{2,}/gu) ?? [];

const STOP = new Set([
  'the', 'and', 'are', 'what', 'which', 'when', 'where', 'why', 'how', 'does', 'explain', 'with', 'from', 'that',
  'this', 'about', 'tell', 'give', 'me', 'is', 'of', 'to', 'in', 'a', 'an', 'it', 'on', 'for', 'be', 'can', 'you',
  'please', 'kya', 'hai', 'mein', 'ka', 'ki', 'ke',
]);

/** Field weights: a match in the title or keywords says far more than one in a long explanation. */
function topicText(t: Topic): string {
  return [
    `${t.title} `.repeat(3),
    `${t.keywords.join(' ')} `.repeat(2),
    t.keyPoints.join(' '),
    t.summary,
    t.simpleExplanation,
    t.explanation,
    t.examples.map((e) => `${e.title} ${e.body}`).join(' '),
  ].join(' ');
}

export type TopicHit = { topic: Topic; moduleTitle: string; score: number };

/** BM25 over a pack's topics. Packs hold at most ~100 topics, so an in-memory index per request is cheap. */
export function searchTopics(pack: LearningPackContent, query: string, limit = 3): TopicHit[] {
  const terms = [...new Set(tokenize(query).filter((t) => !STOP.has(t)))];
  if (terms.length === 0) return [];

  const docs = pack.modules.flatMap((m) =>
    m.topics.map((topic) => {
      const tokens = tokenize(topicText(topic));
      const tf = new Map<string, number>();
      for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      return { topic, moduleTitle: m.title, tf, len: tokens.length };
    }),
  );
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const k1 = 1.2;
  const b = 0.75;

  const idf = new Map(
    terms.map((t) => {
      const n = docs.filter((d) => d.tf.has(t)).length;
      return [t, Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))];
    }),
  );

  return docs
    .map((d) => {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t) ?? 0;
        if (f) score += idf.get(t)! * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
      }
      return { topic: d.topic, moduleTitle: d.moduleTitle, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}

export function findTopic(pack: LearningPackContent, topicId: string) {
  for (const m of pack.modules) {
    const topic = m.topics.find((t) => t.id === topicId);
    if (topic) return { topic, module: m };
  }
  return null;
}
