import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/pool';
import { notFound, unauthorized } from '../../lib/errors';
import { optionalAuth } from '../../middleware/auth';

export const coursesRouter = Router();
export const starterRouter = Router();

const CourseId = z.string().regex(/^[a-z0-9-]+$/);

// Escape LIKE wildcards so a search for "100%" matches literally.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── GET /v1/courses?q=python ─────────────────────────────────────────
coursesRouter.get('/', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(60).optional() }).parse(req.query);
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.subtitle, c.description, c.subject_area, c.semester, c.icon,
            (SELECT count(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
            full_p.version AS pack_version, full_p.size_bytes AS full_size_bytes,
            lite_p.size_bytes AS lite_size_bytes, c.updated_at
       FROM courses c
       LEFT JOIN LATERAL (
         SELECT version, size_bytes FROM learning_packs
          WHERE kind = 'course' AND course_id = c.id AND variant = 'full' AND is_published
          ORDER BY version DESC LIMIT 1) full_p ON true
       LEFT JOIN LATERAL (
         SELECT size_bytes FROM learning_packs
          WHERE kind = 'course' AND course_id = c.id AND variant = 'lite' AND is_published
          ORDER BY version DESC LIMIT 1) lite_p ON true
      WHERE c.is_published
        AND ($1::text IS NULL OR c.title ILIKE '%' || $1 || '%' OR c.description ILIKE '%' || $1 || '%')
      ORDER BY c.sort_order, c.title`,
    [q ? escapeLike(q) : null],
  );

  res.json({
    courses: rows.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      description: c.description,
      subjectArea: c.subject_area,
      semester: c.semester,
      icon: c.icon,
      lessonCount: c.lesson_count,
      packVersion: c.pack_version,
      fullSizeBytes: c.full_size_bytes,
      liteSizeBytes: c.lite_size_bytes,
      updatedAt: c.updated_at,
    })),
  });
});

// ── GET /v1/courses/:id ──────────────────────────────────────────────
coursesRouter.get('/:id', async (req, res) => {
  const id = CourseId.parse(req.params.id);
  const course = await queryOne<Record<string, any>>(
    'SELECT * FROM courses WHERE id = $1 AND is_published',
    [id],
  );
  if (!course) throw notFound('Course');

  const [lessons, quizzes, packs] = await Promise.all([
    pool.query(
      `SELECT id, position, title, content_type, duration_min, is_sample
         FROM lessons WHERE course_id = $1 ORDER BY position`,
      [id],
    ),
    pool.query(
      `SELECT q.id, q.title, q.lesson_id, count(qq.id)::int AS question_count
         FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
        WHERE q.course_id = $1 GROUP BY q.id ORDER BY q.title`,
      [id],
    ),
    pool.query(
      `SELECT DISTINCT ON (variant) id, variant, version, size_bytes, release_notes, published_at
         FROM learning_packs WHERE kind = 'course' AND course_id = $1 AND is_published
        ORDER BY variant, version DESC`,
      [id],
    ),
  ]);

  res.json({
    course: {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      subjectArea: course.subject_area,
      semester: course.semester,
      icon: course.icon,
    },
    lessons: lessons.rows.map((l) => ({
      id: l.id,
      position: l.position,
      title: l.title,
      contentType: l.content_type,
      durationMin: l.duration_min,
      isSample: l.is_sample,
    })),
    quizzes: quizzes.rows.map((q) => ({
      id: q.id,
      title: q.title,
      lessonId: q.lesson_id,
      questionCount: q.question_count,
    })),
    packs: packs.rows.map((p) => ({
      packId: p.id,
      variant: p.variant,
      version: p.version,
      sizeBytes: p.size_bytes,
      releaseNotes: p.release_notes,
      publishedAt: p.published_at,
    })),
  });
});

// ── GET /v1/courses/:id/pack?variant=full|lite ───────────────────────
coursesRouter.get('/:id/pack', optionalAuth, async (req, res) => {
  if (!req.user) throw unauthorized('Log in to download full courses');
  const id = CourseId.parse(req.params.id);
  const { variant } = z.object({ variant: z.enum(['full', 'lite']).default('full') }).parse(req.query);

  const pack = await queryOne<Record<string, any>>(
    `SELECT p.id, p.version, p.variant, p.size_bytes, p.release_notes
       FROM learning_packs p JOIN courses c ON c.id = p.course_id AND c.is_published
      WHERE p.kind = 'course' AND p.course_id = $1 AND p.variant = $2 AND p.is_published
      ORDER BY p.version DESC LIMIT 1`,
    [id, variant],
  );
  if (!pack) throw notFound('Learning pack');

  res.json({
    packId: pack.id,
    courseId: id,
    version: pack.version,
    variant: pack.variant,
    sizeBytes: pack.size_bytes,
    releaseNotes: pack.release_notes,
    manifestUrl: `/v1/packs/${pack.id}/manifest`,
  });
});

// ── GET /v1/starter-bundle (public, no login) ────────────────────────
starterRouter.get('/', async (_req, res) => {
  const pack = await queryOne<Record<string, any>>(
    `SELECT id, version, size_bytes FROM learning_packs
      WHERE kind = 'starter' AND variant = 'lite' AND is_published
      ORDER BY version DESC LIMIT 1`,
  );
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.description, c.icon,
            count(l.id)::int AS sample_lessons,
            EXISTS (SELECT 1 FROM quizzes q WHERE q.course_id = c.id AND q.is_sample) AS has_quiz
       FROM courses c JOIN lessons l ON l.course_id = c.id AND l.is_sample
      GROUP BY c.id ORDER BY c.sort_order`,
  );
  res.json({
    pack: pack
      ? {
          packId: pack.id,
          version: pack.version,
          sizeBytes: pack.size_bytes,
          manifestUrl: `/v1/packs/${pack.id}/manifest`,
        }
      : null,
    courses: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      icon: r.icon,
      sampleLessons: r.sample_lessons,
      hasQuiz: r.has_quiz,
    })),
  });
});
