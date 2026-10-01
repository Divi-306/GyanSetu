import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne, withTransaction } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { buildPacks } from '../packs/packBuilder';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const Slug = z.string().regex(/^[a-z0-9-]+$/);

// PUT /v1/admin/courses/:id: create or update a course
const CourseBody = z.object({
  title: z.string().min(2).max(120),
  subtitle: z.string().max(120).nullable().default(null),
  description: z.string().max(2000).nullable().default(null),
  subjectArea: z.string().max(60).nullable().default(null),
  semester: z.number().int().min(1).max(12).nullable().default(null),
  icon: z.string().max(8).nullable().default(null),
  sortOrder: z.number().int().default(0),
});

adminRouter.put('/courses/:id', async (req, res) => {
  const id = Slug.parse(req.params.id);
  const b = CourseBody.parse(req.body);
  const row = await queryOne(
    `INSERT INTO courses (id, title, subtitle, description, subject_area, semester, icon, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
       description = EXCLUDED.description, subject_area = EXCLUDED.subject_area, semester = EXCLUDED.semester,
       icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, updated_at = now()
     RETURNING *`,
    [id, b.title, b.subtitle, b.description, b.subjectArea, b.semester, b.icon, b.sortOrder],
  );
  res.json({ course: row });
});

// POST /v1/admin/courses/:id/lessons
const LessonBody = z.object({
  position: z.number().int().min(1),
  title: z.string().min(2).max(160),
  contentType: z.enum(['markdown', 'pdf', 'video']).default('markdown'),
  bodyMd: z.string().max(200_000),
  mediaKey: z.string().max(300).nullable().default(null),
  durationMin: z.number().int().min(1).max(600).nullable().default(null),
  isSample: z.boolean().default(false),
});

adminRouter.post('/courses/:id/lessons', async (req, res) => {
  const courseId = Slug.parse(req.params.id);
  const b = LessonBody.parse(req.body);
  const row = await queryOne(
    `INSERT INTO lessons (course_id, position, title, content_type, body_md, media_key, duration_min, is_sample)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [courseId, b.position, b.title, b.contentType, b.bodyMd, b.mediaKey, b.durationMin, b.isSample],
  );
  res.status(201).json({ lesson: row });
});

// PUT /v1/admin/lessons/:lessonId
// Edit rather than delete: devices key progress by lesson UUID, which stays stable.
adminRouter.put('/lessons/:lessonId', async (req, res) => {
  const lessonId = z.uuid().parse(req.params.lessonId);
  const b = LessonBody.parse(req.body);
  const row = await queryOne(
    `UPDATE lessons SET position = $2, title = $3, content_type = $4, body_md = $5, media_key = $6,
            duration_min = $7, is_sample = $8, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [lessonId, b.position, b.title, b.contentType, b.bodyMd, b.mediaKey, b.durationMin, b.isSample],
  );
  if (!row) throw notFound('Lesson');
  res.json({ lesson: row });
});

// POST /v1/admin/courses/:id/quizzes: quiz + questions in one call
const QuizBody = z.object({
  title: z.string().min(2).max(160),
  lessonId: z.uuid().nullable().default(null),
  isSample: z.boolean().default(false),
  questions: z
    .array(
      z.object({
        prompt: z.string().min(3).max(1000),
        options: z.array(z.string().min(1).max(300)).min(2).max(6),
        correctIndex: z.number().int().min(0),
        explanation: z.string().max(1000).nullable().default(null),
      }),
    )
    .min(1)
    .max(100)
    .refine((qs) => qs.every((q) => q.correctIndex < q.options.length), 'correctIndex out of range'),
});

adminRouter.post('/courses/:id/quizzes', async (req, res) => {
  const courseId = Slug.parse(req.params.id);
  const b = QuizBody.parse(req.body);
  const quizId = await withTransaction(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO quizzes (course_id, lesson_id, title, is_sample) VALUES ($1,$2,$3,$4) RETURNING id',
      [courseId, b.lessonId, b.title, b.isSample],
    );
    for (const [i, q] of b.questions.entries()) {
      await db.query(
        `INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rows[0].id, i + 1, q.prompt, JSON.stringify(q.options), q.correctIndex, q.explanation],
      );
    }
    return rows[0].id;
  });
  res.status(201).json({ quizId });
});

// POST /v1/admin/courses/:id/publish: build new pack version + publish course
adminRouter.post('/courses/:id/publish', async (req, res) => {
  const courseId = Slug.parse(req.params.id);
  const { releaseNotes } = z.object({ releaseNotes: z.string().max(500).optional() }).parse(req.body ?? {});
  const manifests = await buildPacks('course', courseId, releaseNotes);
  await pool.query('UPDATE courses SET is_published = true, updated_at = now() WHERE id = $1', [courseId]);
  res.json({ packs: manifests.map((m) => ({ packId: m.packId, version: m.version, variant: m.variant, totalBytes: m.totalBytes })) });
});

// POST /v1/admin/starter/publish
adminRouter.post('/starter/publish', async (_req, res) => {
  const manifests = await buildPacks('starter', null);
  res.json({ packs: manifests.map((m) => ({ packId: m.packId, version: m.version, variant: m.variant, totalBytes: m.totalBytes })) });
});

// PUT /v1/admin/scholarships/:id (upsert by id)
const ScholarshipBody = z.object({
  name: z.string().min(3).max(200),
  provider: z.string().min(2).max(200),
  description: z.string().max(3000).nullable().default(null),
  amountText: z.string().max(200).nullable().default(null),
  eligibilityRules: z.object({
    all: z.array(
      z.object({
        field: z.enum(['age', 'gender', 'category', 'annualFamilyIncome', 'state', 'educationLevel', 'isPwd']),
        op: z.enum(['eq', 'in', 'lte', 'gte']),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
        label: z.string().min(3).max(200),
      }),
    ),
  }),
  deadline: z.iso.date().nullable().default(null),
  applyUrl: z.url(),
  sourceUrl: z.url(),
  lastVerifiedAt: z.iso.datetime({ offset: true }),
  isActive: z.boolean().default(true),
});

adminRouter.put('/scholarships/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const b = ScholarshipBody.parse(req.body);
  const row = await queryOne(
    `INSERT INTO scholarships (id, name, provider, description, amount_text, eligibility_rules, deadline,
                               apply_url, source_url, last_verified_at, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, provider = EXCLUDED.provider,
       description = EXCLUDED.description, amount_text = EXCLUDED.amount_text,
       eligibility_rules = EXCLUDED.eligibility_rules, deadline = EXCLUDED.deadline,
       apply_url = EXCLUDED.apply_url, source_url = EXCLUDED.source_url,
       last_verified_at = EXCLUDED.last_verified_at, is_active = EXCLUDED.is_active, updated_at = now()
     RETURNING *`,
    [id, b.name, b.provider, b.description, b.amountText, JSON.stringify(b.eligibilityRules), b.deadline,
     b.applyUrl, b.sourceUrl, b.lastVerifiedAt, b.isActive],
  );
  res.json({ scholarship: row });
});

// GET /v1/admin/stats
adminRouter.get('/stats', async (_req, res) => {
  const row = await queryOne(
    `SELECT (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM sync_events WHERE received_at > now() - interval '1 day') AS sync_items_24h,
            (SELECT count(*)::int FROM quiz_attempts) AS quiz_attempts,
            (SELECT count(*)::int FROM quiz_attempts WHERE client_score <> server_score) AS score_mismatches,
            (SELECT count(*)::int FROM ai_questions WHERE created_at > now() - interval '1 day') AS ai_questions_24h,
            (SELECT count(*)::int FROM storage_events WHERE event_type = 'archived') AS packs_archived`,
  );
  res.json(row);
});
