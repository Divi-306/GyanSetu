import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool, queryOne } from '../../db/pool';
import { HttpError } from '../../lib/errors';
import { aiConfigured, complete } from '../ai/providers';
import { learningEvidence, type LearningEvidence } from '../learningPacks/history';
import { CAREER_GUIDANCE_SYSTEM, CAREER_ROADMAP_SYSTEM, careerUser } from './career.prompts';

/**
 * Dynamic career guidance. Nothing about careers is hardcoded: paths, match scores,
 * skills and next packs are generated from the student's learning evidence
 * (see learningPacks/history.ts for exactly what that includes and excludes) and
 * regenerated only when that evidence changes.
 */

const str = { type: 'string' } as const;
const int = { type: 'integer' } as const;
const arr = (items: object) => ({ type: 'array', items });
const obj = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

const GUIDANCE_SCHEMA = obj({
  summary: str,
  interests: arr(obj({ label: str, emoji: str, evidence: str })),
  paths: arr(
    obj({
      title: str,
      match: int,
      why: arr(str),
      skillsHave: arr(str),
      skillsToImprove: arr(str),
      nextPacks: arr(obj({ subject: str, durationDays: int, goal: str })),
      projects: arr(str),
    }),
  ),
  caveats: str,
});

const ROADMAP_SCHEMA = obj({
  goal: str,
  currentLevel: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
  skillAreas: arr(obj({ name: str, progress: int, evidence: str })),
  nextSteps: arr(obj({ step: str, why: str, packSubject: str, packDays: int })),
  milestones: arr(str),
});

const pct = z.number().catch(0).transform((n) => Math.max(0, Math.min(100, Math.round(n))));
const Guidance = z.object({
  summary: z.string(),
  interests: z.array(z.object({ label: z.string(), emoji: z.string().catch('✨'), evidence: z.string() })).transform((a) => a.slice(0, 5)),
  paths: z
    .array(
      z.object({
        title: z.string().min(1),
        match: pct,
        why: z.array(z.string()).transform((a) => a.slice(0, 4)),
        skillsHave: z.array(z.string()).transform((a) => a.slice(0, 8)),
        skillsToImprove: z.array(z.string()).transform((a) => a.slice(0, 8)),
        nextPacks: z
          .array(z.object({ subject: z.string().min(1), durationDays: z.number().catch(10).transform((n) => Math.max(3, Math.min(60, Math.round(n)))), goal: z.string() }))
          .transform((a) => a.slice(0, 3)),
        projects: z.array(z.string()).transform((a) => a.slice(0, 3)),
      }),
    )
    .transform((a) => a.slice(0, 4).sort((x, y) => y.match - x.match)),
  caveats: z.string(),
});
const Roadmap = z.object({
  goal: z.string(),
  currentLevel: z.enum(['beginner', 'intermediate', 'advanced']).catch('beginner'),
  skillAreas: z.array(z.object({ name: z.string(), progress: pct, evidence: z.string() })).transform((a) => a.slice(0, 6)),
  nextSteps: z
    .array(z.object({ step: z.string(), why: z.string(), packSubject: z.string(), packDays: z.number().catch(0) }))
    .transform((a) =>
      a.slice(0, 3).map((s) => ({
        step: s.step,
        why: s.why,
        pack: s.packSubject.trim() ? { subject: s.packSubject.trim(), durationDays: Math.max(3, Math.min(60, Math.round(s.packDays || 10))) } : null,
      })),
    ),
  milestones: z.array(z.string()).transform((a) => a.slice(0, 5)),
});

export type CareerGuidance = z.infer<typeof Guidance> & { roadmaps: Record<string, z.infer<typeof Roadmap>> };

/** What the model sees: learning evidence only, rounded so tiny changes don't trigger regeneration. */
function promptEvidence(e: LearningEvidence) {
  return {
    statedInterests: e.interests,
    statedGoals: e.goals,
    studyDaysLast30: e.studyDaysLast30,
    learningPacks: e.packs.map((p) => ({
      title: p.title,
      subject: p.subject,
      category: p.category,
      tags: p.tags,
      goal: p.goal,
      status: p.status,
      percentComplete: Math.round(p.percent / 10) * 10,
      quizAccuracy: p.accuracy == null ? null : Math.round(p.accuracy * 10) * 10,
      answers: p.answers,
      studyHours: Math.round(p.studyMinutes / 30) / 2,
      strongTopics: p.strongTopics,
      weakTopics: p.weakTopics,
    })),
    classicCourses: e.courses.map((c) => ({ title: c.title, percentComplete: Math.round(c.percent / 10) * 10 })),
  };
}

const hashOf = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

const enoughData = (e: LearningEvidence) =>
  e.interests.length > 0 || Boolean(e.goals?.trim()) || e.courses.length > 0 || e.packs.some((p) => p.topicsCompleted > 0 || p.answers > 0);

const parse = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
const unavailable = () => new HttpError(502, 'AI_UNAVAILABLE', 'Career guidance is unavailable right now');

async function generateRoadmap(evidence: unknown, pathTitle: string) {
  const result = await complete({
    system: CAREER_ROADMAP_SYSTEM,
    user: careerUser(evidence, `\n\n<target_path>${pathTitle}</target_path>`),
    schema: ROADMAP_SCHEMA,
    schemaName: 'career_roadmap',
    maxTokens: 4000,
  });
  if (result.kind !== 'json') throw unavailable();
  const parsed = Roadmap.safeParse(parse(result.text));
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

type Stored = { guidance: CareerGuidance; evidence_hash: string; generated_at: Date };

/** The cached guidance, and whether the student's learning has changed since it was made. */
export async function getGuidance(userId: string) {
  const [row, e] = await Promise.all([
    queryOne<Stored>('SELECT guidance, evidence_hash, generated_at FROM career_guidance WHERE user_id = $1', [userId]),
    learningEvidence(userId),
  ]);
  if (!enoughData(e)) return { status: 'insufficient_data' as const, guidance: null, generatedAt: null, outdated: false };
  return {
    status: row ? ('ready' as const) : ('not_generated' as const),
    guidance: row?.guidance ?? null,
    generatedAt: row?.generated_at ?? null,
    outdated: row ? row.evidence_hash !== hashOf(promptEvidence(e)) : true,
  };
}

const FRESH_MS = 24 * 3600 * 1000;

type CacheCheck =
  | { kind: 'ready'; guidance: CareerGuidance; generatedAt: Date }
  | { kind: 'insufficient_data' }
  | { kind: 'needs_generation'; evidence: Record<string, unknown>; hash: string };

/** The fast, no-AI-call part: is there already a fresh-enough cached answer? Safe to run inline in a request. */
async function checkCache(userId: string, force: boolean): Promise<CacheCheck> {
  const e = await learningEvidence(userId);
  if (!enoughData(e)) return { kind: 'insufficient_data' };
  const evidence = promptEvidence(e);
  const hash = hashOf(evidence);
  const cached = await queryOne<Stored>('SELECT guidance, evidence_hash, generated_at FROM career_guidance WHERE user_id = $1', [userId]);
  if (cached && cached.evidence_hash === hash && (!force || Date.now() - cached.generated_at.getTime() < FRESH_MS)) {
    return { kind: 'ready', guidance: cached.guidance, generatedAt: cached.generated_at };
  }
  return { kind: 'needs_generation', evidence, hash };
}

/** The slow, AI-calling part (two model calls) — the part worth running in the background. */
async function generate(userId: string, evidence: Record<string, unknown>, hash: string) {
  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Online AI is not available right now');

  const result = await complete({
    system: CAREER_GUIDANCE_SYSTEM,
    user: careerUser(evidence),
    schema: GUIDANCE_SCHEMA,
    schemaName: 'career_guidance',
    maxTokens: 6000,
  });
  if (result.kind !== 'json') throw unavailable();
  const parsed = Guidance.safeParse(parse(result.text));
  if (!parsed.success || parsed.data.paths.length === 0) throw unavailable();

  const roadmaps: CareerGuidance['roadmaps'] = {};
  roadmaps[parsed.data.paths[0].title] = await generateRoadmap(evidence, parsed.data.paths[0].title);
  const guidance: CareerGuidance = { ...parsed.data, roadmaps };

  const { rows } = await pool.query<{ generated_at: Date }>(
    `INSERT INTO career_guidance (user_id, evidence_hash, guidance, model) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET evidence_hash = EXCLUDED.evidence_hash, guidance = EXCLUDED.guidance,
       model = EXCLUDED.model, generated_at = now()
     RETURNING generated_at`,
    [userId, hash, JSON.stringify(guidance), result.model],
  );
  return { status: 'ready' as const, guidance, generatedAt: rows[0].generated_at, outdated: false };
}

/**
 * Regenerates guidance (and the roadmap for the best path) when the evidence changed, or
 * on `force`. Kept for callers that are fine blocking (tests, scripts); the HTTP route
 * uses `checkCache` + `generate` separately so it can background only the slow part.
 */
export async function refreshGuidance(userId: string, force = false) {
  const check = await checkCache(userId, force);
  if (check.kind === 'insufficient_data') return { status: 'insufficient_data' as const, guidance: null, generatedAt: null, outdated: false };
  if (check.kind === 'ready') return { status: 'ready' as const, guidance: check.guidance, generatedAt: check.generatedAt, outdated: false };
  return generate(userId, check.evidence, check.hash);
}

export { checkCache as checkGuidanceCache, generate as generateGuidance };

/** Roadmap for any recommended path (cached with the guidance). */
export async function roadmapFor(userId: string, pathTitle: string) {
  const cached = await queryOne<Stored>('SELECT guidance, evidence_hash, generated_at FROM career_guidance WHERE user_id = $1', [userId]);
  if (!cached) throw new HttpError(409, 'NO_GUIDANCE', 'Generate career guidance first.');
  const existing = cached.guidance.roadmaps?.[pathTitle];
  if (existing) return existing;
  if (!cached.guidance.paths.some((p) => p.title === pathTitle)) throw new HttpError(404, 'NOT_FOUND', 'That path is not in your guidance');
  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Online AI is not available right now');
  const roadmap = await generateRoadmap(promptEvidence(await learningEvidence(userId)), pathTitle);
  await pool.query(
    `UPDATE career_guidance SET guidance = jsonb_set(guidance, '{roadmaps}', coalesce(guidance->'roadmaps', '{}'::jsonb) || $2::jsonb)
      WHERE user_id = $1`,
    [userId, JSON.stringify({ [pathTitle]: roadmap })],
  );
  return roadmap;
}
