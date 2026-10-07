import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne, withTransaction } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { aiLimiter, packGenerationLimiter } from '../../middleware/rateLimits';
import { requestNewVersion, requestPack, retryVersion } from './generator';
import { LEVELS, type Outline } from './pack.schema';
import { analyzeProgress, askPackTutor, generateQuiz, generateTopicFlashcards, generateTopicQuestions } from './tutor.service';

export const learningPacksRouter = Router();

const PackId = z.uuid();
const Version = z.coerce.number().int().min(1);
const TopicId = z.string().regex(/^[\p{L}\p{M}\p{N}-]{1,80}$/u);

type PackRow = {
  id: string; title: string; subject: string; description: string; category: string; level: string; icon: string;
  duration_days: number | null; daily_minutes: number | null; goal: string | null; depth: string | null;
  source: string; is_public: boolean; created_by: string | null; latest_ready_version: number | null; created_at: Date; updated_at: Date;
};
type VersionRow = {
  version: number; status: string; outline: Outline; modules_total: number; modules_done: number; size_bytes: number | null;
  sha256: string | null; topic_count: number | null; change_notes: string | null; error: string | null; created_at: Date; ready_at: Date | null;
};

const packDto = (p: PackRow) => ({
  id: p.id,
  title: p.title,
  subject: p.subject,
  description: p.description,
  category: p.category,
  level: p.level,
  icon: p.icon,
  source: p.source,
  durationDays: p.duration_days,
  dailyMinutes: p.daily_minutes,
  goal: p.is_public ? null : p.goal, // a personal goal is shown only on the student's own (private) pack
  depth: p.depth,
  latestReadyVersion: p.latest_ready_version,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const versionDto = (v: VersionRow) => ({
  version: v.version,
  status: v.status,
  modulesTotal: v.modules_total,
  modulesDone: v.modules_done,
  sizeBytes: v.size_bytes,
  sha256: v.sha256,
  topicCount: v.topic_count,
  changeNotes: v.change_notes,
  error: v.error,
  createdAt: v.created_at,
  readyAt: v.ready_at,
  outline: {
    levelRange: v.outline.levelRange,
    estimatedHours: v.outline.estimatedHours,
    prerequisites: v.outline.prerequisites,
    learningObjectives: v.outline.learningObjectives,
    modules: v.outline.modules.map((m) => ({
      key: m.key,
      title: m.title,
      description: m.description,
      topics: m.topics.map((t) => ({ key: t.key, title: t.title, difficulty: t.difficulty, kind: t.kind ?? 'lesson', dayNumber: t.dayNumber ?? null })),
    })),
    plan: v.outline.plan
      ? {
          durationDays: v.outline.plan.durationDays,
          dailyMinutes: v.outline.plan.dailyMinutes,
          depth: v.outline.plan.depth,
          coverageStatement: v.outline.plan.coverageStatement,
          outcomes: v.outline.plan.outcomes,
          notCovered: v.outline.plan.notCovered,
          days: v.outline.plan.days.map((d) => ({
            dayNumber: d.dayNumber, title: d.title, focus: d.focus, estimatedMinutes: d.estimatedMinutes,
            completionCriteria: d.completionCriteria, topicKeys: d.topicKeys,
          })),
        }
      : null,
    careerPaths: v.outline.careerPaths ?? [],
  },
});

const VERSION_COLUMNS = `version, status, outline, modules_total, modules_done, size_bytes, sha256, topic_count,
                         change_notes, error, created_at, ready_at`;

/** Public packs are readable by anyone; a private (personal-goal) pack only by its creator or students who saved it. */
async function readablePack(packId: string, userId: string | undefined): Promise<PackRow> {
  const pack = await queryOne<PackRow>('SELECT * FROM generated_packs WHERE id = $1', [packId]);
  if (!pack) throw notFound('Learning pack');
  if (pack.is_public || (userId && pack.created_by === userId)) return pack;
  if (userId && (await queryOne('SELECT 1 FROM pack_library WHERE user_id = $1 AND pack_id = $2', [userId, packId]))) return pack;
  throw notFound('Learning pack'); // don't reveal that a private pack exists
}

async function latestVersion(packId: string) {
  return queryOne<VersionRow>(
    `SELECT ${VERSION_COLUMNS} FROM generated_pack_versions WHERE pack_id = $1 ORDER BY version DESC LIMIT 1`,
    [packId],
  );
}

// ── GET /v1/learning-packs?q= : explore public, ready packs (replaces the fixed course catalog) ──
learningPacksRouter.get('/', async (req, res) => {
  const { q, limit } = z
    .object({ q: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) })
    .parse(req.query);
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const { rows } = await pool.query<PackRow & { module_count: number; topic_count: number; size_bytes: number }>(
    `SELECT p.*, jsonb_array_length(v.outline->'modules') AS module_count, v.topic_count, v.size_bytes
       FROM generated_packs p
       JOIN generated_pack_versions v ON v.pack_id = p.id AND v.version = p.latest_ready_version
      WHERE p.is_public AND ($1::text IS NULL OR p.title ILIKE $1 OR p.subject ILIKE $1 OR p.subject_key ILIKE $1)
      ORDER BY p.updated_at DESC LIMIT $2`,
    [like, limit],
  );
  res.json({
    packs: rows.map((r) => ({ ...packDto(r), moduleCount: r.module_count, topicCount: r.topic_count, sizeBytes: r.size_bytes })),
  });
});

// ── GET /v1/learning-packs/library : the student's saved packs with the newest ready version ──
learningPacksRouter.get('/library', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.pack_id, l.version, l.state, l.client_updated_at, p.title, p.icon, p.level, p.latest_ready_version
       FROM pack_library l JOIN generated_packs p ON p.id = l.pack_id
      WHERE l.user_id = $1 ORDER BY l.client_updated_at DESC`,
    [req.user!.id],
  );
  res.json({
    packs: rows.map((r) => ({
      packId: r.pack_id,
      version: r.version,
      state: r.state,
      updatedAt: r.client_updated_at,
      title: r.title,
      icon: r.icon,
      level: r.level,
      latestReadyVersion: r.latest_ready_version,
    })),
  });
});

// ── POST /v1/learning-packs : "teach me <anything>" → outline now, content in the background ──
learningPacksRouter.post('/', requireAuth, packGenerationLimiter, async (req, res) => {
  const body = z
    .object({
      subject: z.string().trim().min(2).max(200),
      level: z.enum(LEVELS).optional(),
      goal: z.string().trim().max(300).optional(),
      durationDays: z.number().int().min(1).max(180).optional(),
      dailyMinutes: z.number().int().min(10).max(480).optional(),
      fresh: z.boolean().optional(),
    })
    .parse(req.body);
  const { packId, reused } = await requestPack({ userId: req.user!.id, ...body });
  const pack = await readablePack(packId, req.user!.id);
  res.status(reused ? 200 : 202).json({ reused, pack: packDto(pack), version: versionDto((await latestVersion(packId))!) });
});

// ── DELETE /v1/learning-packs/history : clear my learning history ──
// Progress, answers, study time, video positions, tutor chats and career guidance.
// The library (which packs the student saved) stays. Deleting the account removes everything.
learningPacksRouter.delete('/history', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  await withTransaction(async (db) => {
    for (const table of ['pack_progress', 'pack_topic_progress', 'pack_answers', 'pack_chat_messages', 'pack_chat_clears', 'pack_video_progress', 'study_days', 'career_guidance', 'pack_quiz_attempts', 'pack_quizzes']) {
      await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
  });
  res.status(204).end();
});

// ── GET /v1/learning-packs/:id : pack + latest version status (poll while generating) ──
learningPacksRouter.get('/:id', optionalAuth, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user?.id);
  const latest = await latestVersion(pack.id);
  res.json({ pack: packDto(pack), version: latest ? versionDto(latest) : null });
});

// ── GET /v1/learning-packs/:id/versions/:version ──
learningPacksRouter.get('/:id/versions/:version', optionalAuth, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user?.id);
  const v = await queryOne<VersionRow>(
    `SELECT ${VERSION_COLUMNS} FROM generated_pack_versions WHERE pack_id = $1 AND version = $2`,
    [pack.id, Version.parse(req.params.version)],
  );
  if (!v) throw notFound('Pack version');
  res.json({ version: versionDto(v) });
});

// ── GET /v1/learning-packs/:id/versions/:version/content : the pack JSON, byte-exact ──
// The app verifies X-Content-SHA256 before storing the pack for offline use.
learningPacksRouter.get('/:id/versions/:version/content', optionalAuth, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user?.id);
  const v = await queryOne<{ content_text: string; sha256: string }>(
    `SELECT content_text, sha256 FROM generated_pack_versions WHERE pack_id = $1 AND version = $2 AND status = 'ready'`,
    [pack.id, Version.parse(req.params.version)],
  );
  if (!v) throw notFound('Ready pack version');
  res
    .set({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-SHA256': v.sha256,
      ETag: `"${v.sha256}"`,
      'Cache-Control': 'private, max-age=86400, immutable',
    })
    .send(v.content_text);
});

// ── POST /v1/learning-packs/:id/versions : generate an improved version ──
learningPacksRouter.post('/:id/versions', requireAuth, packGenerationLimiter, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const { changeRequest } = z.object({ changeRequest: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const { version } = await requestNewVersion(pack.id, changeRequest);
  const v = await queryOne<VersionRow>(
    `SELECT ${VERSION_COLUMNS} FROM generated_pack_versions WHERE pack_id = $1 AND version = $2`,
    [pack.id, version],
  );
  res.status(202).json({ version: versionDto(v!) });
});

// ── POST /v1/learning-packs/:id/versions/:version/retry : resume a failed generation ──
learningPacksRouter.post('/:id/versions/:version/retry', requireAuth, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const version = Version.parse(req.params.version);
  await retryVersion(pack.id, version);
  const v = await queryOne<VersionRow>(
    `SELECT ${VERSION_COLUMNS} FROM generated_pack_versions WHERE pack_id = $1 AND version = $2`,
    [pack.id, version],
  );
  res.status(202).json({ version: versionDto(v!) });
});

// ── POST /v1/learning-packs/:id/tutor : online tutor grounded in this pack ──
learningPacksRouter.post('/:id/tutor', requireAuth, aiLimiter, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const body = z
    .object({
      question: z.string().trim().min(1).max(1000),
      topicId: TopicId.optional(),
      history: z.array(z.object({ role: z.enum(['user', 'tutor']), text: z.string().max(4000) })).max(12).optional(),
      context: z
        .object({
          currentTopicId: TopicId.optional(),
          completedTopicIds: z.array(TopicId).max(200).optional(),
          weakTopicIds: z.array(TopicId).max(50).optional(),
          percent: z.number().int().min(0).max(100).optional(),
        })
        .optional(),
    })
    .parse(req.body);
  res.json(await askPackTutor({ packId: pack.id, ...body }));
});

// ── POST /v1/learning-packs/:id/topics/:topicId/questions : fresh MCQs / viva questions ──
learningPacksRouter.post('/:id/topics/:topicId/questions', requireAuth, aiLimiter, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const body = z
    .object({
      mcqCount: z.number().int().min(0).max(10).default(5),
      vivaCount: z.number().int().min(0).max(5).default(0),
      difficulty: z.enum([...LEVELS, 'mixed']).default('mixed'),
      weakPoints: z.array(z.string().max(300)).max(10).default([]),
    })
    .parse(req.body ?? {});
  res.json(await generateTopicQuestions({ packId: pack.id, topicId: TopicId.parse(req.params.topicId), ...body }));
});

// ── POST /v1/learning-packs/:id/topics/:topicId/flashcards : fresh flashcards ──
learningPacksRouter.post('/:id/topics/:topicId/flashcards', requireAuth, aiLimiter, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const { count } = z.object({ count: z.number().int().min(1).max(15).default(6) }).parse(req.body ?? {});
  res.json(await generateTopicFlashcards({ packId: pack.id, topicId: TopicId.parse(req.params.topicId), count }));
});

// ── POST /v1/learning-packs/:id/quiz/generate : a self-contained, savable quiz ──
learningPacksRouter.post('/:id/quiz/generate', requireAuth, aiLimiter, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const body = z
    .object({
      topicIds: z.array(TopicId).max(50).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
      count: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
    })
    .parse(req.body ?? {});
  res.json(await generateQuiz({ packId: pack.id, ...body }));
});

// ── POST /v1/learning-packs/:id/insights : AI study plan from the student's progress ──
learningPacksRouter.post('/:id/insights', requireAuth, aiLimiter, async (req, res) => {
  const pack = await readablePack(PackId.parse(req.params.id), req.user!.id);
  const { topics } = z
    .object({
      topics: z
        .array(
          z.object({
            topicId: TopicId,
            completed: z.boolean(),
            attempts: z.number().int().min(0),
            accuracy: z.number().min(0).max(1).nullable(),
            timeSpentSec: z.number().int().min(0),
            recentWrong: z.array(z.string().max(300)).max(5),
          }),
        )
        .max(200),
    })
    .parse(req.body);
  res.json(await analyzeProgress(pack.id, topics));
});
