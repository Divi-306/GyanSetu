import { db } from '@/db';
import { api, ApiError, hasSession, NetworkError } from '@/lib/api';

export type Confidence = 'high' | 'medium' | 'low';

export type AiAnswer = {
  answer: string;
  confidence: Confidence;
  groundedInCourseMaterial: boolean;
  sources: { id: string; label: string; courseId: string; lessonId: string | null }[];
  mode: 'online' | 'offline';
};

export const NOT_FOUND_OFFLINE =
  "I couldn't find enough information about this in your downloaded learning material. Connect to the internet for a broader answer.";

// Same word rule as the server: \p{M} keeps Devanagari vowel signs inside Hindi words.
const tokenize = (s: string) => [...new Set(s.toLowerCase().match(/[\p{L}\p{M}\p{N}]{3,}/gu) ?? [])];

// Common English question words that would otherwise match everything.
const STOP = new Set(['what', 'which', 'when', 'where', 'why', 'how', 'the', 'and', 'are', 'does', 'explain', 'with', 'from', 'that', 'this', 'between', 'difference', 'about', 'kya', 'hai', 'mein']);

/**
 * Offline answer: keyword search over the AI chunks shipped inside downloaded
 * packs. Returns the best excerpt with its source, or an explicit
 * "not found" answer, never an invented one.
 */
export async function askOffline(question: string, courseId?: string): Promise<AiAnswer> {
  const terms = tokenize(question).filter((t) => !STOP.has(t));
  if (terms.length === 0) {
    return { answer: NOT_FOUND_OFFLINE, confidence: 'low', groundedInCourseMaterial: false, sources: [], mode: 'offline' };
  }
  const chunks = await db.getAllAsync<{ id: string; course_id: string; lesson_id: string | null; text: string; source_label: string }>(
    courseId ? 'SELECT * FROM ai_chunks WHERE course_id = ?' : 'SELECT * FROM ai_chunks',
    ...(courseId ? [courseId] : []),
  );

  let best: (typeof chunks)[number] | null = null;
  let bestScore = 0;
  for (const c of chunks) {
    const words = new Set(tokenize(c.text));
    const hits = terms.filter((t) => words.has(t) || [...words].some((w) => w.startsWith(t) || t.startsWith(w))).length;
    const score = hits / terms.length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  if (!best || bestScore < 0.34) {
    return { answer: NOT_FOUND_OFFLINE, confidence: 'low', groundedInCourseMaterial: false, sources: [], mode: 'offline' };
  }
  // Show the excerpt itself (minus markdown headings): offline we quote, we don't paraphrase.
  const excerpt = best.text.replace(/^#+\s*/gm, '').trim();
  return {
    answer: `From your downloaded lessons:\n\n${excerpt}`,
    confidence: bestScore >= 0.75 ? 'high' : bestScore >= 0.5 ? 'medium' : 'low',
    groundedInCourseMaterial: true,
    sources: [{ id: best.id, label: best.source_label, courseId: best.course_id, lessonId: best.lesson_id }],
    mode: 'offline',
  };
}

/** Online first (Claude via the server); falls back to the offline path whenever the server can't answer. */
export async function askTutor(question: string, opts: { online: boolean; courseId?: string }): Promise<AiAnswer> {
  if (opts.online && (await hasSession())) {
    try {
      return await api<AiAnswer>('/v1/ai/ask', {
        method: 'POST',
        body: { question, courseId: opts.courseId },
        timeoutMs: 70_000,
      });
    } catch (err) {
      // Validation and rate-limit errors are the student's to see; anything else → offline answer.
      if (err instanceof ApiError && (err.status === 400 || err.status === 429)) throw err;
      if (!(err instanceof NetworkError) && !(err instanceof ApiError)) throw err;
    }
  }
  return askOffline(question, opts.courseId);
}
