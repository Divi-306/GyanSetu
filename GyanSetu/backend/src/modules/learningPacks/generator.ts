import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { pool, queryOne, withTransaction, type Db } from '../../db/pool';
import { HttpError, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { aiConfigured, complete } from '../ai/providers';
import { hasLearningHistory, learnerProfileText, learningEvidence } from './history';
import {
  MODULE_JSON_SCHEMA,
  ModuleReply,
  OUTLINE_JSON_SCHEMA,
  OutlineReply,
  PLAN_JSON_SCHEMA,
  PlanReply,
  sanitizeQuestions,
  slugify,
  type LearningPackContent,
  type Level,
  type Module,
  type Outline,
  type OutlineTopic,
  type Topic,
  type Video,
} from './pack.schema';
import { applyPlan } from './plan';
import { MODULE_SYSTEM, OUTLINE_SYSTEM, PLAN_SYSTEM, moduleUser, outlineUser, planUser } from './prompts';
import { findVideos } from './videos';

const MODULE_ATTEMPTS = 3;
/** Module calls in flight across all generations: keeps us inside provider rate limits. */
const MAX_PARALLEL_MODULE_CALLS = 3;
const GENERATION_TIMEOUT_MS = 180_000;

// ─────────────────────────── Subject normalisation ───────────────────────────

/**
 * "Teach me Computer Networks!" → "computer networks". Requests that normalise to
 * the same key (and level) share one pack instead of paying for a new generation.
 */
export function normalizeSubject(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/^\s*(please\s+)?(can you\s+)?(teach me|i want to learn|i would like to learn|i'd like to learn|help me (learn|understand)|learn|explain|study)\s+(about\s+)?/i, '')
    .replace(/\b(from scratch|for beginners|in detail|please)\b/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}+#]+/gu, ' ') // keep c++ / c#
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// ─────────────────────────── Outline ───────────────────────────

const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** Unique slug per id; the model sometimes repeats keys or leaves them blank. */
function uniqueSlug(raw: string, fallback: string, taken: Set<string>): string {
  const base = slugify(raw || fallback);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Calls the outline model and returns a normalised outline (unique, stable keys). */
async function generateOutline(input: {
  subject: string;
  level?: Level;
  goal?: string;
  durationDays?: number;
  dailyMinutes?: number;
  learnerProfile?: string;
  previousOutline?: Outline;
  changeRequest?: string;
}) {
  const result = await complete({
    system: OUTLINE_SYSTEM,
    user: outlineUser(input),
    schema: OUTLINE_JSON_SCHEMA,
    schemaName: 'learning_pack_outline',
    maxTokens: 8000,
    timeoutMs: 90_000,
  });
  if (result.kind === 'refused') {
    throw new HttpError(422, 'NOT_LEARNABLE', "I can't create a learning pack for that. Try a different subject.");
  }
  const parsed = OutlineReply.safeParse(parseJson(result.text));
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues.slice(0, 3) }, 'Outline reply did not match the schema');
    throw new HttpError(502, 'AI_UNAVAILABLE', 'Could not design this learning pack right now. Please try again.');
  }
  const o = parsed.data;
  if (!o.learnable) {
    throw new HttpError(422, 'NOT_LEARNABLE', o.rejectionReason || "That doesn't look like something I can teach. Try a subject or topic.");
  }

  const moduleIds = new Set<string>();
  const topicIds = new Set<string>();
  const modules = o.modules
    .filter((m) => m.topics.length > 0)
    .map((m, i) => ({
      key: uniqueSlug(m.key, m.title || `module-${i + 1}`, moduleIds),
      title: m.title,
      description: m.description,
      topics: m.topics.map(
        (t, j): OutlineTopic => ({
          key: uniqueSlug(t.key, t.title || `topic-${i + 1}-${j + 1}`, topicIds),
          title: t.title,
          summary: t.summary,
          difficulty: t.difficulty,
          // Revision/practice/assessment are the planner's job; the curriculum only teaches and builds.
          kind: t.kind === 'project' ? 'project' : 'lesson',
          priority: t.priority,
          estimatedMinutes: t.estimatedMinutes,
        }),
      ),
    }));
  if (modules.length === 0) {
    throw new HttpError(502, 'AI_UNAVAILABLE', 'Could not design this learning pack right now. Please try again.');
  }

  const outline: Outline = {
    title: o.title,
    subject: o.subject,
    category: o.category,
    icon: o.icon,
    description: o.description,
    level: input.level ?? o.level,
    levelRange: o.levelRange,
    estimatedHours: o.estimatedHours,
    prerequisites: o.prerequisites,
    learningObjectives: o.learningObjectives,
    tags: o.tags,
    modules,
  };
  return { outline, model: result.model, inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0 };
}

// ─────────────────────────── Duration planner ───────────────────────────

export type PlanRequest = { durationDays: number; dailyMinutes: number; goal: string | null };

/**
 * Deterministic fallback when the planner call fails: lay topics out in order,
 * filling each day up to the daily minutes. applyPlan then adds revision days.
 */
export function fallbackPlan(outline: Outline, req: PlanRequest) {
  const topics = outline.modules.flatMap((m) => m.topics);
  const total = topics.reduce((s, t) => s + (t.estimatedMinutes ?? 20), 0);
  const perDay = Math.max(req.dailyMinutes, Math.ceil(total / req.durationDays));
  const days: { dayNumber: number; title: string; focus: string; topicKeys: string[]; estimatedMinutes: number; completionCriteria: string }[] = [];
  let day = { minutes: 0, keys: [] as string[] };
  for (const t of topics) {
    if (day.keys.length && day.minutes + (t.estimatedMinutes ?? 20) > perDay && days.length < req.durationDays - 1) {
      days.push({ dayNumber: days.length + 1, title: '', focus: '', topicKeys: day.keys, estimatedMinutes: day.minutes, completionCriteria: '' });
      day = { minutes: 0, keys: [] };
    }
    day.keys.push(t.key);
    day.minutes += t.estimatedMinutes ?? 20;
  }
  if (day.keys.length) days.push({ dayNumber: days.length + 1, title: '', focus: '', topicKeys: day.keys, estimatedMinutes: day.minutes, completionCriteria: '' });
  return { depth: 'foundation' as const, coverageStatement: '', outcomes: outline.learningObjectives, notCovered: [], careerPaths: [], extraTopics: [], days };
}

async function planDays(outline: Outline, req: PlanRequest): Promise<{ outline: Outline; inputTokens: number; outputTokens: number }> {
  const curriculum = outline.modules.map((m) => ({
    moduleKey: m.key,
    title: m.title,
    topics: m.topics.map((t) => ({ key: t.key, title: t.title, kind: t.kind, priority: t.priority, estimatedMinutes: t.estimatedMinutes })),
  }));
  try {
    const result = await complete({
      system: PLAN_SYSTEM,
      user: planUser({ curriculum, durationDays: req.durationDays, dailyMinutes: req.dailyMinutes, goal: req.goal ?? undefined, level: outline.level }),
      schema: PLAN_JSON_SCHEMA,
      schemaName: 'duration_plan',
      maxTokens: 12000,
      timeoutMs: 120_000,
    });
    const parsed = result.kind === 'json' ? PlanReply.safeParse(parseJson(result.text)) : null;
    if (parsed?.success) {
      return {
        outline: applyPlan(outline, parsed.data, req),
        inputTokens: result.kind === 'json' ? (result.inputTokens ?? 0) : 0,
        outputTokens: result.kind === 'json' ? (result.outputTokens ?? 0) : 0,
      };
    }
    logger.warn('planner reply unusable; using the deterministic plan');
  } catch (err) {
    if (err instanceof HttpError && err.code === 'AI_BUSY') throw err;
    logger.warn({ err: String(err) }, 'planner failed; using the deterministic plan');
  }
  return { outline: applyPlan(outline, fallbackPlan(outline, req), req), inputTokens: 0, outputTokens: 0 };
}

// ─────────────────────────── Public API: create / version / retry ───────────────────────────

export type GenerateInput = {
  userId: string;
  subject: string;
  level?: Level;
  goal?: string;
  /** Duration-based pack: N days at about `dailyMinutes` a day. */
  durationDays?: number;
  dailyMinutes?: number;
  fresh?: boolean;
};

/**
 * Starts a learning pack for any subject. Returns quickly with the curriculum (and
 * day plan for duration-based packs); lesson content is generated in the background.
 *
 * Personalisation: the curriculum adapts to the student's goal and learning history.
 * A pack shaped by either is private to them; otherwise a matching public pack
 * (same subject, level, duration and daily time) is reused at no AI cost.
 */
export async function requestPack(input: GenerateInput): Promise<{ packId: string; version: number; reused: boolean }> {
  const subjectKey = normalizeSubject(input.subject);
  if (subjectKey.length < 2) throw new HttpError(400, 'INVALID_SUBJECT', 'Tell me what you want to learn, e.g. "Computer Networks".');
  const durationDays = input.durationDays ?? null;
  const dailyMinutes = durationDays ? (input.dailyMinutes ?? 45) : null;

  const evidence = await learningEvidence(input.userId);
  const personalised = Boolean(input.goal) || hasLearningHistory(evidence);

  if (!input.fresh && !personalised) {
    const existing = await queryOne<{ id: string; version: number }>(
      `SELECT p.id, v.version FROM generated_packs p
         JOIN LATERAL (SELECT version, status FROM generated_pack_versions
                        WHERE pack_id = p.id ORDER BY version DESC LIMIT 1) v ON v.status <> 'failed'
        WHERE p.subject_key = $1 AND p.is_public AND ($2::text IS NULL OR p.level = $2)
          AND p.duration_days IS NOT DISTINCT FROM $3 AND p.daily_minutes IS NOT DISTINCT FROM $4
        ORDER BY p.latest_ready_version DESC NULLS LAST, p.created_at DESC LIMIT 1`,
      [subjectKey, input.level ?? null, durationDays, dailyMinutes],
    );
    if (existing) return { packId: existing.id, version: existing.version, reused: true };
  }

  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Online AI is not available right now');
  const curriculum = await generateOutline({
    subject: input.subject.trim(),
    level: input.level,
    goal: input.goal,
    durationDays: durationDays ?? undefined,
    dailyMinutes: dailyMinutes ?? undefined,
    learnerProfile: learnerProfileText(evidence) || undefined,
  });
  let { outline } = curriculum;
  let { inputTokens, outputTokens } = curriculum;
  if (durationDays && dailyMinutes) {
    const planned = await planDays(outline, { durationDays, dailyMinutes, goal: input.goal ?? null });
    outline = planned.outline;
    inputTokens += planned.inputTokens;
    outputTokens += planned.outputTokens;
  }

  const packId = await withTransaction(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO generated_packs (subject_key, title, subject, description, category, level, icon, created_by, is_public,
                                    duration_days, daily_minutes, goal, depth)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [subjectKey, outline.title, outline.subject, outline.description, outline.category, outline.level, outline.icon,
        input.userId, !personalised, durationDays, dailyMinutes, input.goal ?? null, outline.plan?.depth ?? null],
    );
    await insertVersion(db, rows[0].id, 1, outline, { model: curriculum.model, inputTokens, outputTokens, changeNotes: null });
    return rows[0].id;
  });

  void startGeneration(packId, 1);
  return { packId, version: 1, reused: false };
}

async function insertVersion(
  db: Db,
  packId: string,
  version: number,
  outline: Outline,
  meta: { model: string; inputTokens: number; outputTokens: number; changeNotes: string | null },
) {
  await db.query(
    `INSERT INTO generated_pack_versions (pack_id, version, status, outline, modules_total, model, input_tokens, output_tokens, change_notes)
     VALUES ($1, $2, 'generating', $3, $4, $5, $6, $7, $8)`,
    [packId, version, JSON.stringify(outline), outline.modules.length, meta.model, meta.inputTokens, meta.outputTokens, meta.changeNotes],
  );
  for (const [i, m] of outline.modules.entries()) {
    await db.query(
      'INSERT INTO generated_pack_modules (pack_id, version, module_key, position, status) VALUES ($1, $2, $3, $4, $5)',
      [packId, version, m.key, i + 1, 'pending'],
    );
  }
}

/** Generates an improved next version, keeping topic keys stable so progress carries over. */
export async function requestNewVersion(packId: string, changeRequest?: string) {
  const pack = await queryOne<{ subject: string; level: Level; source: string; duration_days: number | null; daily_minutes: number | null; goal: string | null }>(
    'SELECT subject, level, source, duration_days, daily_minutes, goal FROM generated_packs WHERE id = $1',
    [packId],
  );
  if (!pack) throw notFound('Learning pack');
  if (pack.source !== 'ai') throw conflict('NOT_REGENERABLE', 'This pack was converted from a course and is updated by the course team.');
  const latest = await queryOne<{ version: number; status: string; outline: Outline }>(
    'SELECT version, status, outline FROM generated_pack_versions WHERE pack_id = $1 ORDER BY version DESC LIMIT 1',
    [packId],
  );
  if (latest?.status === 'generating') throw conflict('ALREADY_GENERATING', 'A new version of this pack is already being prepared.');
  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Online AI is not available right now');

  const curriculum = await generateOutline({
    subject: pack.subject,
    level: pack.level,
    goal: pack.goal ?? undefined,
    durationDays: pack.duration_days ?? undefined,
    dailyMinutes: pack.daily_minutes ?? undefined,
    previousOutline: latest?.outline,
    changeRequest,
  });
  let { outline, inputTokens, outputTokens } = curriculum;
  const { model } = curriculum;
  if (pack.duration_days && pack.daily_minutes) {
    const planned = await planDays(outline, { durationDays: pack.duration_days, dailyMinutes: pack.daily_minutes, goal: pack.goal });
    outline = planned.outline;
    inputTokens += planned.inputTokens;
    outputTokens += planned.outputTokens;
  }
  const version = (latest?.version ?? 0) + 1;
  await withTransaction(async (db) => {
    await insertVersion(db, packId, version, outline, { model, inputTokens, outputTokens, changeNotes: changeRequest ?? 'Improved version' });
  });
  void startGeneration(packId, version);
  return { packId, version };
}

/** Resumes a failed generation: only modules that aren't ready yet are generated again. */
export async function retryVersion(packId: string, version: number) {
  const updated = await pool.query(
    `UPDATE generated_pack_versions SET status = 'generating', error = NULL
      WHERE pack_id = $1 AND version = $2 AND status = 'failed'`,
    [packId, version],
  );
  if (updated.rowCount === 0) {
    const exists = await queryOne('SELECT 1 FROM generated_pack_versions WHERE pack_id = $1 AND version = $2', [packId, version]);
    if (!exists) throw notFound('Pack version');
    throw conflict('NOT_FAILED', 'Only a failed version can be retried.');
  }
  await pool.query(
    `UPDATE generated_pack_modules SET status = 'pending', attempts = 0, error = NULL
      WHERE pack_id = $1 AND version = $2 AND status = 'failed'`,
    [packId, version],
  );
  void startGeneration(packId, version);
}

// ─────────────────────────── Background generation ───────────────────────────

const running = new Map<string, Promise<void>>();

/** Starts (or joins) the background job for one pack version. Never rejects. */
export function startGeneration(packId: string, version: number): Promise<void> {
  const key = `${packId}:${version}`;
  let job = running.get(key);
  if (!job) {
    job = runGeneration(packId, version)
      .catch((err) => logger.error({ err, packId, version }, 'pack generation crashed'))
      .finally(() => running.delete(key));
    running.set(key, job);
  }
  return job;
}

/** For tests and graceful shutdown: resolves when the job (if any) is finished. */
export function waitForGeneration(packId: string, version: number): Promise<void> {
  return running.get(`${packId}:${version}`) ?? Promise.resolve();
}

/** Jobs live in memory; after a restart, pick up versions that were mid-generation. */
export async function resumeInterruptedGenerations() {
  const { rows } = await pool.query<{ pack_id: string; version: number }>(
    "SELECT pack_id, version FROM generated_pack_versions WHERE status = 'generating'",
  );
  for (const r of rows) void startGeneration(r.pack_id, r.version);
  if (rows.length) logger.info({ count: rows.length }, 'resumed interrupted pack generations');
}

let inFlight = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_PARALLEL_MODULE_CALLS) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, env.NODE_ENV === 'test' ? 0 : ms));

export type ModuleContent = ReturnType<typeof ModuleReply.parse>;

async function generateModule(outline: Outline, moduleKey: string) {
  const module = outline.modules.find((m) => m.key === moduleKey)!;
  const packOutline = {
    title: outline.title,
    level: outline.level,
    levelRange: outline.levelRange,
    plan: outline.plan ? { durationDays: outline.plan.durationDays, dailyMinutes: outline.plan.dailyMinutes, goal: outline.plan.goal } : null,
    modules: outline.modules.map((m) => ({
      key: m.key,
      title: m.title,
      topics: m.topics.map((t) => `${t.title} [${t.kind ?? 'lesson'}${t.dayNumber ? `, day ${t.dayNumber}` : ''}]`),
    })),
  };
  const result = await withSlot(() =>
    complete({
      system: MODULE_SYSTEM,
      user: moduleUser({ packOutline, module }),
      schema: MODULE_JSON_SCHEMA,
      schemaName: 'learning_pack_module',
      maxTokens: 16000,
      timeoutMs: GENERATION_TIMEOUT_MS,
    }),
  );
  if (result.kind === 'refused') throw new Error('model refused the module');
  const parsed = ModuleReply.safeParse(parseJson(result.text));
  if (!parsed.success) throw new Error(`module reply off-schema: ${parsed.error.issues[0]?.message}`);
  const matched = module.topics.filter((t, i) => matchTopic(parsed.data, t.key, t.title, i)).length;
  return { content: parsed.data, matched, expected: module.topics.length, result };
}

/** The model's topic for an outline topic: same key, else same title, else same position. */
function matchTopic(content: ModuleContent, key: string, title: string, index: number) {
  return (
    content.topics.find((t) => slugify(t.key) === key) ??
    content.topics.find((t) => t.title.trim().toLowerCase() === title.trim().toLowerCase()) ??
    content.topics[index]
  );
}

async function runGeneration(packId: string, version: number) {
  const v = await queryOne<{ outline: Outline; status: string }>(
    'SELECT outline, status FROM generated_pack_versions WHERE pack_id = $1 AND version = $2',
    [packId, version],
  );
  if (!v || v.status !== 'generating') return;

  const { rows: pending } = await pool.query<{ module_key: string }>(
    `SELECT module_key FROM generated_pack_modules
      WHERE pack_id = $1 AND version = $2 AND status <> 'ready' ORDER BY position`,
    [packId, version],
  );

  await Promise.all(
    pending.map(async ({ module_key }) => {
      let lastError = '';
      for (let attempt = 1; attempt <= MODULE_ATTEMPTS; attempt++) {
        try {
          const { content, matched, expected, result } = await generateModule(v.outline, module_key);
          // A reply that skipped topics gets one more try; after that, keep what we have.
          if (matched < expected && attempt < MODULE_ATTEMPTS - 1) throw new Error(`only ${matched}/${expected} topics`);
          if (matched === 0) throw new Error('no topics in reply');
          await withTransaction(async (db) => {
            await db.query(
              `UPDATE generated_pack_modules SET status = 'ready', content = $4, attempts = attempts + 1, error = NULL, updated_at = now()
                WHERE pack_id = $1 AND version = $2 AND module_key = $3`,
              [packId, version, module_key, JSON.stringify(content)],
            );
            await db.query(
              `UPDATE generated_pack_versions SET modules_done = modules_done + 1,
                 input_tokens = input_tokens + $3, output_tokens = output_tokens + $4
                WHERE pack_id = $1 AND version = $2`,
              [packId, version, result.kind === 'json' ? (result.inputTokens ?? 0) : 0, result.kind === 'json' ? (result.outputTokens ?? 0) : 0],
            );
          });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          logger.warn({ packId, version, module_key, attempt, err: lastError }, 'module generation failed');
          // Rate limited: back off longer before the next attempt.
          await sleep(err instanceof HttpError && err.code === 'AI_BUSY' ? 20_000 * attempt : 2_000 * attempt);
        }
      }
      await pool.query(
        `UPDATE generated_pack_modules SET status = 'failed', attempts = attempts + $4, error = $5, updated_at = now()
          WHERE pack_id = $1 AND version = $2 AND module_key = $3`,
        [packId, version, module_key, MODULE_ATTEMPTS, lastError.slice(0, 500)],
      );
    }),
  );

  const { rows: modules } = await pool.query<{ module_key: string; status: string; content: ModuleContent | null }>(
    'SELECT module_key, status, content FROM generated_pack_modules WHERE pack_id = $1 AND version = $2 ORDER BY position',
    [packId, version],
  );
  if (modules.length === 0 || modules.some((m) => m.status !== 'ready')) {
    await pool.query(
      `UPDATE generated_pack_versions SET status = 'failed', error = $3 WHERE pack_id = $1 AND version = $2`,
      [packId, version, 'Some modules could not be generated. Retry to continue where it stopped.'],
    );
    return;
  }

  // Videos are a bonus: provider or model failures leave the pack without them, never block it.
  const videos = await findVideos(v.outline);
  await publishVersion(packId, version, v.outline, new Map(modules.map((m) => [m.module_key, m.content!])), 'ai', videos);
}

// ─────────────────────────── Assembly ───────────────────────────

const itemId = (topicId: string, kind: string, n: number) => `${topicId}~${kind}-${n}`;

function buildTopic(outlineTopic: OutlineTopic, c: ModuleContent['topics'][number], position: number, videos: Video[]): Topic {
  const id = outlineTopic.key;
  return {
    id,
    key: outlineTopic.key,
    position,
    kind: outlineTopic.kind ?? 'lesson',
    dayNumber: outlineTopic.dayNumber ?? null,
    title: outlineTopic.title,
    difficulty: c.difficulty ?? outlineTopic.difficulty,
    estimatedMinutes: c.estimatedMinutes,
    objectives: c.objectives,
    explanation: c.explanation,
    simpleExplanation: c.simpleExplanation,
    analogy: c.analogy,
    keyPoints: c.keyPoints,
    examples: c.examples,
    formulas: c.formulas,
    commonMistakes: c.commonMistakes,
    mcqs: sanitizeQuestions.mcqs(c.mcqs).map((q, i) => ({ id: itemId(id, 'mcq', i + 1), ...q })),
    viva: sanitizeQuestions.viva(c.viva).map((q, i) => ({ id: itemId(id, 'viva', i + 1), ...q })),
    practice: sanitizeQuestions.practice(c.practice).map((q, i) => ({ id: itemId(id, 'practice', i + 1), ...q })),
    flashcards: sanitizeQuestions.flashcards(c.flashcards).map((q, i) => ({ id: itemId(id, 'card', i + 1), ...q })),
    summary: c.summary,
    keywords: c.keywords,
    videos,
  };
}

/** Assembles the final pack JSON from the outline and module contents. Pure: no I/O. */
export function assemblePack(args: {
  packId: string;
  version: number;
  outline: Outline;
  modules: Map<string, ModuleContent>;
  model: string | null;
  source: 'ai' | 'course';
  previousTopicIds: string[] | null;
  videos?: Map<string, Video[]>;
}): LearningPackContent {
  const { outline } = args;
  const modules: Module[] = [];
  const glossary: LearningPackContent['glossary'] = [];

  for (const om of outline.modules) {
    const content = args.modules.get(om.key);
    if (!content) continue;
    const topics: Topic[] = [];
    om.topics.forEach((ot, j) => {
      const c = matchTopic(content, ot.key, ot.title, j);
      if (c) topics.push(buildTopic(ot, c, topics.length + 1, args.videos?.get(ot.key) ?? []));
    });
    if (topics.length === 0) continue;
    modules.push({
      id: om.key,
      key: om.key,
      position: modules.length + 1,
      title: om.title,
      description: om.description,
      objectives: content.objectives,
      summary: content.summary,
      revisionNotes: content.revisionNotes,
      topics,
    });
    const seen = new Set(glossary.map((g) => g.term.toLowerCase()));
    for (const g of content.glossary) {
      if (g.term && g.definition && !seen.has(g.term.toLowerCase())) glossary.push({ ...g, moduleId: om.key });
    }
  }

  const topicIds = modules.flatMap((m) => m.topics.map((t) => t.id));
  const topicCount = topicIds.length;
  const present = new Set(topicIds);
  // Days reference topics that were actually written; a day whose topics all failed would be empty.
  const plan = outline.plan
    ? {
        ...outline.plan,
        days: outline.plan.days.map(({ topicKeys, ...d }) => ({ ...d, topicIds: topicKeys.filter((k) => present.has(k)) })),
      }
    : null;
  return {
    schemaVersion: 3,
    packId: args.packId,
    version: args.version,
    title: outline.title,
    subject: outline.subject,
    description: outline.description,
    category: outline.category,
    level: outline.level,
    levelRange: outline.levelRange,
    icon: outline.icon,
    language: 'en',
    createdAt: new Date().toISOString(),
    generatedBy: { model: args.model, source: args.source },
    plan,
    careerPaths: outline.careerPaths ?? [],
    metadata: {
      estimatedMinutes: plan
        ? plan.days.reduce((s, d) => s + d.estimatedMinutes, 0)
        : modules.reduce((s, m) => s + m.topics.reduce((t, x) => t + x.estimatedMinutes, 0), 0),
      prerequisites: outline.prerequisites,
      learningObjectives: outline.learningObjectives,
      tags: outline.tags,
      moduleCount: modules.length,
      topicCount,
    },
    modules,
    glossary,
    migration: args.previousTopicIds
      ? { fromVersion: args.version - 1, removedTopicIds: args.previousTopicIds.filter((id) => !topicIds.includes(id)) }
      : null,
  };
}

/** Topic ids of the newest ready version before `version`, for progress migration notes. */
async function previousTopicIds(packId: string, version: number): Promise<string[] | null> {
  const prev = await queryOne<{ content_text: string }>(
    `SELECT content_text FROM generated_pack_versions
      WHERE pack_id = $1 AND version < $2 AND status = 'ready' ORDER BY version DESC LIMIT 1`,
    [packId, version],
  );
  if (!prev) return null;
  const content = JSON.parse(prev.content_text) as LearningPackContent;
  return content.modules.flatMap((m) => m.topics.map((t) => t.id));
}

/** Stores the assembled pack byte-exactly with its checksum and makes it the latest ready version. */
export async function publishVersion(
  packId: string,
  version: number,
  outline: Outline,
  modules: Map<string, ModuleContent>,
  source: 'ai' | 'course' = 'ai',
  videos?: Map<string, Video[]>,
) {
  const meta = await queryOne<{ model: string | null }>(
    'SELECT model FROM generated_pack_versions WHERE pack_id = $1 AND version = $2',
    [packId, version],
  );
  const content = assemblePack({
    packId, version, outline, modules, model: meta?.model ?? null, source, videos,
    previousTopicIds: await previousTopicIds(packId, version),
  });
  const text = JSON.stringify(content);
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');

  await withTransaction(async (db) => {
    await db.query(
      `UPDATE generated_pack_versions
          SET status = 'ready', content_text = $3, sha256 = $4, size_bytes = $5, topic_count = $6, ready_at = now(), error = NULL
        WHERE pack_id = $1 AND version = $2`,
      [packId, version, text, sha256, Buffer.byteLength(text, 'utf8'), content.metadata.topicCount],
    );
    await db.query(
      `UPDATE generated_packs SET latest_ready_version = GREATEST(coalesce(latest_ready_version, 0), $2),
         title = $3, description = $4, icon = $5, updated_at = now() WHERE id = $1`,
      [packId, version, content.title, content.description, content.icon],
    );
  });
  invalidatePackCache(packId);
  return content;
}

// ─────────────────────────── Reading packs ───────────────────────────

const cache = new Map<string, LearningPackContent>();
const CACHE_MAX = 20;

function invalidatePackCache(packId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${packId}:`)) cache.delete(k);
}

/** Parsed content of a ready version (latest when `version` is omitted). Small LRU: tutor calls reuse it. */
export async function loadPackContent(packId: string, version?: number): Promise<LearningPackContent> {
  const row = await queryOne<{ version: number; content_text: string }>(
    `SELECT version, content_text FROM generated_pack_versions
      WHERE pack_id = $1 AND status = 'ready' AND ($2::int IS NULL OR version = $2)
      ORDER BY version DESC LIMIT 1`,
    [packId, version ?? null],
  );
  if (!row) throw notFound('Ready learning pack');
  const key = `${packId}:${row.version}`;
  let content = cache.get(key);
  if (!content) {
    content = JSON.parse(row.content_text) as LearningPackContent;
    cache.set(key, content);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  return content;
}
