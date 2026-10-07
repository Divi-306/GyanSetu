import { db } from '@/db';
import type { SearchResult } from './types';

export type KnownPack = { id: string; title: string };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STOP = new Set(['the', 'my', 'a', 'an', 'of', 'and', 'course', 'courses', 'pack', 'packs', 'subject', 'class', 'basics', 'fundamentals']);
const words = (s: string) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** "Data Structures & Algorithms" → "dsa" */
function acronym(title: string) {
  return norm(title)
    .split(' ')
    .filter((w) => w.length > 1 && !['and', 'of', 'the'].includes(w))
    .map((w) => w[0])
    .join('');
}

/** Every learning pack on this phone (downloaded packs plus library entries not yet downloaded here). */
export async function listKnownPacks(): Promise<KnownPack[]> {
  return db.getAllAsync<KnownPack>(
    `SELECT pack_id AS id, title FROM lp_packs
     UNION
     SELECT pack_id AS id, title FROM lp_library WHERE state = 'active' AND pack_id NOT IN (SELECT pack_id FROM lp_packs)`,
  );
}

function scorePack(target: string, p: KnownPack): number {
  const t = norm(target);
  if (!t) return 0;
  const tCompact = t.replace(/ /g, '');
  const title = norm(p.title);
  if (t === title) return 95;
  if (tCompact === acronym(p.title)) return 90;
  if (title.includes(t) && t.length >= 3) return 80;
  if (t.includes(title)) return 75;
  const tw = words(target);
  const pw = new Set(words(p.title));
  if (tw.length === 0 || pw.size === 0) return 0;
  const hits = tw.filter((w) => pw.has(w) || [...pw].some((x) => x.startsWith(w) && w.length >= 4)).length;
  return hits === 0 ? 0 : Math.round(40 + (50 * hits) / Math.max(tw.length, pw.size));
}

/**
 * Matches what the student said ("DSA", "data structures", "python") to a real
 * learning pack. Returns null rather than guessing when nothing matches well.
 */
export async function resolvePack(target: string | null): Promise<KnownPack | null> {
  if (!target?.trim()) return null;
  const packs = await listKnownPacks();
  let best: KnownPack | null = null;
  let bestScore = 0;
  for (const p of packs) {
    const s = scorePack(target, p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return bestScore >= 60 ? best : null;
}

/** Finds a learning pack mentioned anywhere in a sentence (used by the offline parser). */
export async function findPackInText(text: string): Promise<KnownPack | null> {
  const packs = await listKnownPacks();
  const t = ` ${norm(text)} `;
  const tCompact = t.replace(/ /g, '');
  let best: KnownPack | null = null;
  let bestLen = 0;
  for (const p of packs) {
    const candidates = [norm(p.title), acronym(p.title)].filter((x) => x.length >= 2);
    for (const cand of candidates) {
      const hit = t.includes(` ${cand} `) || (cand.length >= 5 && tCompact.includes(cand.replace(/ /g, '')));
      if (hit && cand.length > bestLen) {
        best = p;
        bestLen = cand.length;
      }
    }
  }
  return best;
}

/** Offline search over what is on the phone: pack titles and downloaded topics. */
export async function searchLocal(query: string, limit = 6): Promise<SearchResult[]> {
  const terms = words(query).filter((w) => w.length >= 2);
  if (terms.length === 0) return [];
  const like = terms.map((t) => `%${t}%`);

  const topicScore = terms.map(() => `(CASE WHEN lower(t.title) LIKE ? THEN 3 ELSE 0 END)`).join(' + ');
  const topics = await db.getAllAsync<{ id: string; title: string; pack_id: string; pack_title: string | null; score: number }>(
    `SELECT t.id, t.title, t.pack_id, p.title AS pack_title, (${topicScore}) AS score
       FROM lp_topics t LEFT JOIN lp_packs p ON p.pack_id = t.pack_id
      WHERE score > 0 ORDER BY score DESC, t.position LIMIT ?`,
    ...like,
    limit,
  );

  const packScore = terms.map(() => `(CASE WHEN lower(title) LIKE ? THEN 3 ELSE 0 END)`).join(' + ');
  const packs = await db.getAllAsync<{ pack_id: string; title: string; score: number }>(
    `SELECT pack_id, title, (${packScore}) AS score FROM lp_packs WHERE score > 0 ORDER BY score DESC LIMIT 3`,
    ...like,
  );

  return [
    ...packs.map((p) => ({ id: `pack:${p.pack_id}`, title: p.title, subtitle: 'Learning Pack', href: `/packs/${p.pack_id}` as const })),
    ...topics.map((t) => ({
      id: `topic:${t.id}`,
      title: t.title,
      subtitle: t.pack_title ? `${t.pack_title} • Topic` : 'Topic',
      href: `/packs/${t.pack_id}/topic/${t.id}` as const,
    })),
  ].slice(0, limit);
}
