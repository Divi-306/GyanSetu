import { db } from '@/db';
import type { SearchResult } from './types';

export type KnownCourse = { id: string; title: string };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STOP = new Set(['the', 'my', 'a', 'an', 'of', 'and', 'course', 'courses', 'subject', 'class', 'basics', 'fundamentals']);
const words = (s: string) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** "Data Structures & Algorithms" → "dsa" */
function acronym(title: string) {
  return norm(title)
    .split(' ')
    .filter((w) => w.length > 1 && !['and', 'of', 'the'].includes(w))
    .map((w) => w[0])
    .join('');
}

/** Every course the app knows about: the cached catalog plus Starter Bundle subjects. */
export async function listKnownCourses(): Promise<KnownCourse[]> {
  return db.getAllAsync<KnownCourse>('SELECT id, title FROM courses ORDER BY in_catalog DESC, sort_order, title');
}

function scoreCourse(target: string, c: KnownCourse): number {
  const t = norm(target);
  if (!t) return 0;
  const tCompact = t.replace(/ /g, '');
  if (tCompact === c.id.replace(/-/g, '')) return 100;
  const title = norm(c.title);
  if (t === title) return 95;
  if (tCompact === acronym(c.title)) return 90;
  if (title.includes(t) && t.length >= 3) return 80;
  if (t.includes(title)) return 75;
  const tw = words(target);
  const cw = new Set(words(c.title));
  if (tw.length === 0 || cw.size === 0) return 0;
  const hits = tw.filter((w) => cw.has(w) || [...cw].some((x) => x.startsWith(w) && w.length >= 4)).length;
  return hits === 0 ? 0 : Math.round(40 + (50 * hits) / Math.max(tw.length, cw.size));
}

/**
 * Matches what the student said ("DSA", "data structures", "python") to a real
 * course id. Returns null rather than guessing when nothing matches well.
 */
export async function resolveCourse(target: string | null): Promise<KnownCourse | null> {
  if (!target?.trim()) return null;
  const courses = await listKnownCourses();
  let best: KnownCourse | null = null;
  let bestScore = 0;
  for (const c of courses) {
    const s = scoreCourse(target, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= 60 ? best : null;
}

/** Finds a course mentioned anywhere in a sentence (used by the offline parser). */
export async function findCourseInText(text: string): Promise<KnownCourse | null> {
  const courses = await listKnownCourses();
  const t = ` ${norm(text)} `;
  const tCompact = t.replace(/ /g, '');
  let best: KnownCourse | null = null;
  let bestLen = 0;
  for (const c of courses) {
    const candidates = [norm(c.title), c.id.replace(/-/g, ' '), acronym(c.title)].filter((x) => x.length >= 2);
    for (const cand of candidates) {
      const hit = t.includes(` ${cand} `) || (cand.length >= 5 && tCompact.includes(cand.replace(/ /g, '')));
      if (hit && cand.length > bestLen) {
        best = c;
        bestLen = cand.length;
      }
    }
  }
  return best;
}

/** Offline search over what is on the phone: course titles and downloaded lessons. */
export async function searchLocal(query: string, limit = 6): Promise<SearchResult[]> {
  const terms = words(query).filter((w) => w.length >= 2);
  if (terms.length === 0) return [];
  const like = terms.map((t) => `%${t}%`);

  const lessonScore = terms.map(() => `(CASE WHEN lower(l.title) LIKE ? THEN 3 ELSE 0 END + CASE WHEN lower(l.body_md) LIKE ? THEN 1 ELSE 0 END)`).join(' + ');
  const lessons = await db.getAllAsync<{ id: string; title: string; position: number; course_title: string | null; score: number }>(
    `SELECT l.id, l.title, l.position, c.title AS course_title, (${lessonScore}) AS score
       FROM lessons l LEFT JOIN courses c ON c.id = l.course_id
      WHERE score > 0 ORDER BY score DESC, l.position LIMIT ?`,
    ...like.flatMap((p) => [p, p]),
    limit,
  );

  const courseScore = terms.map(() => `(CASE WHEN lower(title) LIKE ? THEN 3 ELSE 0 END + CASE WHEN lower(coalesce(description, '')) LIKE ? THEN 1 ELSE 0 END)`).join(' + ');
  const courses = await db.getAllAsync<{ id: string; title: string; score: number }>(
    `SELECT id, title, (${courseScore}) AS score FROM courses WHERE score > 0 ORDER BY score DESC LIMIT 3`,
    ...like.flatMap((p) => [p, p]),
  );

  return [
    ...courses.map((c) => ({ id: `course:${c.id}`, title: c.title, subtitle: 'Course', href: `/course/${c.id}` as const })),
    ...lessons.map((l) => ({
      id: `lesson:${l.id}`,
      title: l.title,
      subtitle: `${l.course_title ?? 'Lesson'} • Lesson ${l.position}`,
      href: `/lesson/${l.id}` as const,
    })),
  ].slice(0, limit);
}
