import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { pool, queryOne, withTransaction, type Db } from '../../db/pool';
import { HttpError, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { aiConfigured, complete } from '../ai/providers';
import { createTask } from '../tasks/taskManager';
import { hasLearningHistory, learnerProfileText, learningEvidence } from './history';
import {
  ModuleReply,
  OUTLINE_JSON_SCHEMA,
  OutlineReply,
  PLAN_JSON_SCHEMA,
  PlanReply,
  sanitizeQuestions,
  slugify,
  TOPIC_JSON_SCHEMA,
  TopicReply,
  type LearningPackContent,
  type Level,
  type Module,
  type Outline,
  type OutlineTopic,
  type Topic,
  type Video,
} from './pack.schema';
import { applyPlan } from './plan';
import { OUTLINE_SYSTEM, PLAN_SYSTEM, TOPIC_SYSTEM, outlineUser, planUser, topicUser } from './prompts';
import { findVideos } from './videos';

/** Each topic is its own small AI call (see generateTopic), so far fewer attempts are
 * needed than the old one-call-per-whole-module approach — a transient failure here is
 * cheap to retry. */
const TOPIC_ATTEMPTS = 3;
/** Outline generation has no pending row to retry later (it runs inline in the create-pack
 * request), so it gets its own small retry budget against transient "AI busy" responses. */
const OUTLINE_ATTEMPTS = 3;
/** Longest a single outline attempt will wait out Groq's own retry-after before giving up,
 * so a large provider-issued wait can't hang the create-pack HTTP response for minutes. */
const OUTLINE_MAX_WAIT_MS = 8_000;
/** Module calls in flight across all generations: keeps us inside provider rate limits. */
/** Configurable: see PACK_MODULE_CONCURRENCY in config/env.ts for why this defaults low. */
const MAX_PARALLEL_MODULE_CALLS = env.PACK_MODULE_CONCURRENCY;
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
  // Runs synchronously inside the create-pack HTTP request (there's no pending row yet to
  // retry later, unlike topics/modules), so a single transient "AI busy" must not surface
  // as a hard failure to the student. Deliberately does NOT go through withSlot's shared
  // pacing clock: that clock is pushed forward by BACKGROUND topic generation for other,
  // unrelated packs (up to MAX_SHARED_WAIT_MS = 60s), which has nothing to do with whether
  // Groq can actually take this call right now — sharing it meant outline creation failed
  // instantly any time background work elsewhere had recently hit a snag, even while Groq
  // itself had full headroom (observed 2026-10-08: consistent AI_BUSY with retryAfterMs
  // counting down from a stale shared-clock push, while a direct equivalent call to Groq
  // succeeded immediately). This calls Groq directly and only waits out ITS OWN retry-after,
  // capped short so the HTTP response the student is watching never hangs for minutes.
  let result: Awaited<ReturnType<typeof complete>> | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= OUTLINE_ATTEMPTS; attempt++) {
    try {
      result = await complete({
        system: OUTLINE_SYSTEM,
        user: outlineUser(input),
        schema: OUTLINE_JSON_SCHEMA,
        schemaName: 'learning_pack_outline',
        maxTokens: 8000,
        timeoutMs: 90_000,
      });
      break;
    } catch (err) {
      lastErr = err;
      const busy = err instanceof HttpError && err.code === 'AI_BUSY';
      logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'outline generation failed');
      if (busy) {
        const retryAfterMs = (err as HttpError).details as { retryAfterMs?: number } | undefined;
        const wait = retryAfterMs?.retryAfterMs ?? 0;
        if (wait > OUTLINE_MAX_WAIT_MS) break; // don't hang the HTTP response on a long provider-issued wait
        if (wait > 0) await sleep(wait);
      } else {
        await sleep(1_500 * attempt);
      }
    }
  }
  if (!result) {
    if (lastErr instanceof HttpError && lastErr.code === 'AI_BUSY') {
      throw new HttpError(503, 'AI_BUSY', 'The AI is handling a lot of requests right now. Please try again in a minute.', lastErr.details);
    }
    throw lastErr instanceof HttpError ? lastErr : new HttpError(502, 'AI_UNAVAILABLE', 'Could not design this learning pack right now. Please try again.');
  }
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
    const result = await withSlot(() =>
      complete({
        system: PLAN_SYSTEM,
        user: planUser({ curriculum, durationDays: req.durationDays, dailyMinutes: req.dailyMinutes, goal: req.goal ?? undefined, level: outline.level }),
        schema: PLAN_JSON_SCHEMA,
        schemaName: 'duration_plan',
        maxTokens: 12000,
        timeoutMs: 120_000,
      }),
    );
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
    // Every failure here — AI busy included — falls back to the deterministic plan rather
    // than failing the whole pack creation: fallbackPlan() always succeeds with no AI call,
    // and a sensible day-by-day layout beats a hard error when the account is rate-limited.
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
  // A pointer row, not a second retry/progress engine: this module already retries and
  // tracks modules_done/modules_total itself (see withSlot/runGeneration above). The task
  // row just makes this generation show up in the student's unified "background work"
  // list (GET /v1/tasks); tasks.routes.ts lazily mirrors status from here on read.
  await createTask(input.userId, 'LEARNING_PACK_GENERATION', { packId, version: 1 });
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
  const pack = await queryOne<{ subject: string; level: Level; source: string; duration_days: number | null; daily_minutes: number | null; goal: string | null; created_by: string | null }>(
    'SELECT subject, level, source, duration_days, daily_minutes, goal, created_by FROM generated_packs WHERE id = $1',
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
  if (pack.created_by) await createTask(pack.created_by, 'LEARNING_PACK_GENERATION', { packId, version });
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

/**
 * Earliest time the next module-generation call may start. Shared globally (across every
 * module of every pack being generated), because they all draw on the same AI provider
 * key's one shared token-per-minute budget.
 *
 * This is NOT the same thing as `MAX_PARALLEL_MODULE_CALLS`: that only stops two calls
 * being *in flight* at the same instant. A rejected call returns almost instantly (no
 * real work happened), so without this gate, the moment one module's call is rejected and
 * frees its slot, a *different* module's own retry loop immediately grabs the slot and
 * fires straight into the same still-empty budget — which is exactly what "module A
 * attempt 2, module B attempt 2, module C attempt 3, all within one second" in the logs
 * looks like. Every call waits on this one clock before it may proceed; a busy response
 * pushes it forward, so every OTHER module's next attempt waits too, not just that one.
 */
let nextCallAt = 0;
const DEFAULT_BUSY_WAIT_MS = 45_000;
/**
 * Hard ceiling on how far a single busy response may push the shared clock, regardless of
 * what the provider's retry-after says. Observed empirically (2026-10-08) under sustained
 * real load: Groq returned retry-after: 234s. Honouring that verbatim would make EVERY
 * other call sharing this clock — including unrelated packs' topic generation — wait up to
 * four minutes because of one response. Clamping it means the clock still backs off
 * meaningfully, but never by more than this.
 */
const MAX_SHARED_WAIT_MS = 60_000;
/**
 * Verified empirically against a real Groq key (2026-10-08): the per-minute token budget
 * is a rolling window of ACTUAL usage, and admission for a new call checks its requested
 * size against whatever is CURRENTLY remaining — so a background job that fires its calls
 * back-to-back as fast as the network allows (whenever it isn't actively rate-limited) can
 * still keep the window's remaining budget too low, too often, for an interactive request
 * (tutor, Navigator, quiz) that happens to arrive in that moment to be admitted — even
 * though neither side is doing anything wrong on its own. Spacing background calls out
 * (not just reacting to 429s after the fact) lowers its average consumption RATE, which
 * leaves more of the window free on average for interactive traffic to land in.
 */
const MIN_GAP_MS = env.PACK_GENERATION_MIN_GAP_MS;

/**
 * Runs `fn` once this process's shared pacing slot/clock allow it. `maxWaitMs` bounds how
 * long THIS CALL will wait for the clock specifically (default: however long it takes) — a
 * caller that blocks an HTTP response the student is waiting on (outline generation) passes
 * a short bound and gets back an AI_BUSY error instead of hanging if the clock's current
 * wait exceeds it; a background caller (topic generation) can afford to wait it out.
 */
async function withSlot<T>(fn: () => Promise<T>, maxWaitMs = Infinity): Promise<T> {
  if (inFlight >= MAX_PARALLEL_MODULE_CALLS) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    const wait = nextCallAt - Date.now();
    if (wait > maxWaitMs) throw new HttpError(503, 'AI_BUSY', 'The AI tutor is busy. Try again in a minute.', { retryAfterMs: wait });
    if (wait > 0) await sleep(wait);
    try {
      const result = await fn();
      nextCallAt = Math.max(nextCallAt, Date.now() + MIN_GAP_MS);
      return result;
    } catch (err) {
      if (err instanceof HttpError && err.code === 'AI_BUSY') {
        const retryAfterMs = (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
        nextCallAt = Date.now() + Math.min(retryAfterMs ?? DEFAULT_BUSY_WAIT_MS, MAX_SHARED_WAIT_MS);
      }
      throw err;
    }
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, env.NODE_ENV === 'test' ? 0 : ms));

export type ModuleContent = ReturnType<typeof ModuleReply.parse>;
type TopicContent = ModuleContent['topics'][number];

/** The model's topic for an outline topic: same key, else same title, else same position. */
function matchTopic(content: ModuleContent, key: string, title: string, index: number) {
  return (
    content.topics.find((t) => slugify(t.key) === key) ??
    content.topics.find((t) => t.title.trim().toLowerCase() === title.trim().toLowerCase()) ??
    content.topics[index]
  );
}

const compactOutline = (outline: Outline) => ({
  title: outline.title,
  level: outline.level,
  levelRange: outline.levelRange,
  plan: outline.plan ? { durationDays: outline.plan.durationDays, dailyMinutes: outline.plan.dailyMinutes, goal: outline.plan.goal } : null,
  modules: outline.modules.map((m) => ({
    key: m.key,
    title: m.title,
    topics: m.topics.map((t) => `${t.title} [${t.kind ?? 'lesson'}${t.dayNumber ? `, day ${t.dayNumber}` : ''}]`),
  })),
});

/**
 * One topic per call: the old one-call-per-whole-module approach needed up to 16,000
 * output tokens in a single request, which a low-tier key's per-minute token budget
 * (as low as 8,000, shared by every model on the account) can never satisfy — Groq
 * rejects a request outright the instant its OWN requested max tokens exceeds that
 * budget. A single topic needs a few thousand tokens, comfortably inside it.
 */
async function generateTopic(outline: Outline, moduleKey: string, topicKey: string) {
  const module = outline.modules.find((m) => m.key === moduleKey)!;
  const topic = module.topics.find((t) => t.key === topicKey)!;
  const result = await withSlot(() =>
    complete({
      system: TOPIC_SYSTEM,
      user: topicUser({ packOutline: compactOutline(outline), module: { key: module.key, title: module.title }, topic }),
      schema: TOPIC_JSON_SCHEMA,
      schemaName: 'learning_pack_topic',
      maxTokens: 4000,
      timeoutMs: GENERATION_TIMEOUT_MS,
      // Runs in the background after the pack-creation request already responded; the
      // student isn't waiting on this specific call, so it gets the tighter token cap
      // (see GROQ_BACKGROUND_MAX_TOKENS_PER_REQUEST) that leaves room for interactive
      // AI features to keep working while a pack generates.
      priority: 'background',
    }),
  );
  if (result.kind === 'refused') throw new Error('model refused the topic');
  const parsed = TopicReply.safeParse(parseJson(result.text));
  if (!parsed.success) throw new Error(`topic reply off-schema: ${parsed.error.issues[0]?.message}`);
  return { content: parsed.data, result };
}

/** A markdown cheat-sheet of the module, built from its topics' own key points — no extra AI call needed. */
function synthesizeRevisionNotes(moduleTitle: string, topics: TopicContent[]): string {
  const sections = topics.map((t) => `## ${t.title}\n${t.keyPoints.map((k) => `- ${k}`).join('\n')}`).join('\n\n');
  return `# ${moduleTitle} — revision\n\n${sections}`;
}

async function generateModule(outline: Outline, moduleKey: string) {
  const module = outline.modules.find((m) => m.key === moduleKey)!;
  const topicContents = new Map<string, TopicContent>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastError = '';

  await Promise.all(
    module.topics.map(async (topic) => {
      for (let attempt = 1; attempt <= TOPIC_ATTEMPTS; attempt++) {
        try {
          const { content, result } = await generateTopic(outline, moduleKey, topic.key);
          // Trust our own topic key, not the model's echo: downstream matching is exact-key based.
          topicContents.set(topic.key, { ...content, key: topic.key });
          if (result.kind === 'json') {
            totalInputTokens += result.inputTokens ?? 0;
            totalOutputTokens += result.outputTokens ?? 0;
          }
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          logger.warn({ moduleKey, topicKey: topic.key, attempt, err: lastError }, 'topic generation failed');
          // A busy error already pushed withSlot's shared clock forward (see withSlot): the
          // next attempt — for this topic or any other — waits there, so no extra sleep here
          // (that would just double the wait). A non-busy failure isn't a budget problem, so
          // it only gets a short pause.
          const busy = err instanceof HttpError && err.code === 'AI_BUSY';
          if (!busy) await sleep(1_500 * attempt);
        }
      }
    }),
  );

  // Outline order; topics that never came back after every attempt are simply left out
  // (same tolerance the old per-module generator had for a reply that skipped topics).
  const topics = module.topics.map((t) => topicContents.get(t.key)).filter((t): t is TopicContent => !!t);
  const content: ModuleContent = {
    summary: topics.map((t) => t.summary).filter(Boolean).slice(0, 3).join(' '),
    revisionNotes: synthesizeRevisionNotes(module.title, topics),
    objectives: [...new Set(topics.flatMap((t) => t.objectives))].slice(0, 10),
    glossary: [],
    topics,
  };
  return { content, matched: topics.length, expected: module.topics.length, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, lastError };
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
      const { content, matched, expected, inputTokens, outputTokens, lastError } = await generateModule(v.outline, module_key);
      if (matched === 0) {
        logger.warn({ packId, version, module_key, err: lastError }, 'module generation failed: no topics came back');
        await pool.query(
          `UPDATE generated_pack_modules SET status = 'failed', attempts = attempts + 1, error = $4, updated_at = now()
            WHERE pack_id = $1 AND version = $2 AND module_key = $3`,
          [packId, version, module_key, lastError.slice(0, 500)],
        );
        return;
      }
      if (matched < expected) {
        logger.warn({ packId, version, module_key, matched, expected }, 'module generation partially succeeded; missing topics were left out');
      }
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
          [packId, version, inputTokens, outputTokens],
        );
      });
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
