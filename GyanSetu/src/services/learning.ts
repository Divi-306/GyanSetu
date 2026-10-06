import * as Crypto from 'expo-crypto';
import { db, kvGet } from '@/db';
import { useApp } from '@/stores/appStore';
import { enqueue, flush, refreshPendingCount } from './sync';

// ─────────────────────────── Types ───────────────────────────

export type CourseSummary = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  icon: string | null;
  lessonCount: number;
  fullSizeBytes: number | null;
  liteSizeBytes: number | null;
  serverPackVersion: number | null;
  /** Downloaded pack, if any. */
  pack: { version: number; variant: string; state: string; sizeBytes: number } | null;
  percent: number;
};

export type StarterCourse = {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  sampleLessons: number;
  hasQuiz: boolean;
};

export type LessonRow = {
  id: string;
  courseId: string;
  position: number;
  title: string;
  contentType: string;
  bodyMd: string;
  durationMin: number | null;
  mediaUri: string | null;
  mediaOmitted: boolean;
  completed: boolean;
};

export type QuizSummary = { id: string; courseId: string; title: string; questionCount: number; courseTitle: string; icon: string | null };

export type QuizQuestion = {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
};

// ─────────────────────────── Helpers ───────────────────────────

function changed() {
  useApp.getState().bumpData();
  void refreshPendingCount();
  // Fire and forget: sends immediately when online and logged in, otherwise waits for the next trigger.
  void flush();
}

/**
 * Denominator for course %. The catalog knows the full lesson count; a guest
 * who only has the starter samples must not get 100% for finishing 2 of 3
 * lessons, because the server keeps the maximum percent it ever receives.
 */
async function lessonTotal(courseId: string): Promise<number> {
  const row = await db.getFirstAsync<{ catalog: number | null; local: number }>(
    `SELECT (SELECT lesson_count FROM courses WHERE id = ?) AS catalog,
            (SELECT count(*) FROM lessons WHERE course_id = ?) AS local`,
    courseId,
    courseId,
  );
  return Math.max(row?.catalog ?? 0, row?.local ?? 0, 1);
}

async function computePercent(courseId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT count(*) AS n FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id WHERE l.course_id = ?`,
    courseId,
  );
  return Math.min(100, Math.round((100 * (row?.n ?? 0)) / (await lessonTotal(courseId))));
}

// ─────────────────────────── Catalog ───────────────────────────

export async function listCatalog(): Promise<CourseSummary[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT c.*, p.version AS p_version, p.variant AS p_variant, p.state AS p_state, p.size_bytes AS p_size,
            coalesce(cp.percent, 0) AS percent
       FROM courses c
       LEFT JOIN learning_packs p ON p.pack_key = c.id
       LEFT JOIN course_progress cp ON cp.course_id = c.id
      WHERE c.in_catalog = 1
      ORDER BY c.sort_order, c.title`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    icon: r.icon,
    lessonCount: r.lesson_count ?? 0,
    fullSizeBytes: r.full_size_bytes,
    liteSizeBytes: r.lite_size_bytes,
    serverPackVersion: r.pack_version,
    pack: r.p_version != null ? { version: r.p_version, variant: r.p_variant, state: r.p_state, sizeBytes: r.p_size } : null,
    percent: r.percent,
  }));
}

/** Courses with at least one lesson on this device (downloaded pack or Starter Bundle samples). */
export async function listOfflineCourseIds(): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ course_id: string }>('SELECT DISTINCT course_id FROM lessons');
  return new Set(rows.map((r) => r.course_id));
}

export async function listStarterCourses(): Promise<StarterCourse[]> {
  return (await kvGet<StarterCourse[]>('starter.courses')) ?? [];
}

export async function getCourse(courseId: string) {
  const course = await db.getFirstAsync<any>('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return null;
  const lessons = await listLessons(courseId);
  const quizzes = await db.getAllAsync<{ id: string; title: string; n: number }>(
    `SELECT q.id, q.title, count(qq.id) AS n FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
      WHERE q.course_id = ? GROUP BY q.id ORDER BY q.title`,
    courseId,
  );
  const pack = await db.getFirstAsync<any>('SELECT * FROM learning_packs WHERE pack_key = ?', courseId);
  const progress = await db.getFirstAsync<{ percent: number; last_lesson_id: string | null }>(
    'SELECT percent, last_lesson_id FROM course_progress WHERE course_id = ?',
    courseId,
  );
  return {
    id: course.id as string,
    title: course.title as string,
    subtitle: course.subtitle as string | null,
    description: course.description as string | null,
    icon: course.icon as string | null,
    inCatalog: course.in_catalog === 1,
    catalogLessonCount: (course.lesson_count as number | null) ?? lessons.length,
    fullSizeBytes: course.full_size_bytes as number | null,
    liteSizeBytes: course.lite_size_bytes as number | null,
    serverPackVersion: course.pack_version as number | null,
    pack: pack
      ? { version: pack.version as number, variant: pack.variant as string, state: pack.state as string, sizeBytes: pack.size_bytes as number }
      : null,
    lessons,
    quizzes: quizzes.map((q) => ({ id: q.id, title: q.title, questionCount: q.n })),
    percent: progress?.percent ?? 0,
    lastLessonId: progress?.last_lesson_id ?? null,
  };
}

export type CourseDetail = NonNullable<Awaited<ReturnType<typeof getCourse>>>;

// ─────────────────────────── Lessons ───────────────────────────

function toLesson(r: any): LessonRow {
  return {
    id: r.id,
    courseId: r.course_id,
    position: r.position,
    title: r.title,
    contentType: r.content_type,
    bodyMd: r.body_md,
    durationMin: r.duration_min,
    mediaUri: r.media_uri,
    mediaOmitted: r.media_omitted === 1,
    completed: r.completed_at != null,
  };
}

export async function listLessons(courseId: string): Promise<LessonRow[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT l.*, lc.completed_at FROM lessons l LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id
      WHERE l.course_id = ? ORDER BY l.position`,
    courseId,
  );
  return rows.map(toLesson);
}

export async function getLesson(lessonId: string) {
  const row = await db.getFirstAsync<any>(
    `SELECT l.*, lc.completed_at, c.title AS course_title FROM lessons l
       LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id
       LEFT JOIN courses c ON c.id = l.course_id
      WHERE l.id = ?`,
    lessonId,
  );
  if (!row) return null;
  const siblings = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM lessons WHERE course_id = ? ORDER BY position',
    row.course_id,
  );
  const index = siblings.findIndex((s) => s.id === lessonId);
  return {
    lesson: toLesson(row),
    courseTitle: (row.course_title as string | null) ?? row.course_id,
    index,
    total: siblings.length,
    previousId: index > 0 ? siblings[index - 1].id : null,
    nextId: index < siblings.length - 1 ? siblings[index + 1].id : null,
  };
}

/** Remembers where the student is, so "Continue Learning" can resume here. */
export async function recordLessonOpened(lessonId: string) {
  const lesson = await db.getFirstAsync<{ course_id: string }>('SELECT course_id FROM lessons WHERE id = ?', lessonId);
  if (!lesson) return;
  const now = new Date().toISOString();
  const percent = await computePercent(lesson.course_id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO course_progress (course_id, percent, last_lesson_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(course_id) DO UPDATE SET last_lesson_id = excluded.last_lesson_id, updated_at = excluded.updated_at,
         percent = max(course_progress.percent, excluded.percent)`,
      lesson.course_id,
      percent,
      lessonId,
      now,
    );
    await enqueue(db, 'PROGRESS_UPDATED', { courseId: lesson.course_id, percent, lastLessonId: lessonId, updatedAt: now });
  });
  changed();
}

export async function markLessonCompleted(lessonId: string) {
  const lesson = await db.getFirstAsync<{ course_id: string }>('SELECT course_id FROM lessons WHERE id = ?', lessonId);
  if (!lesson) return;
  const already = await db.getFirstAsync('SELECT 1 FROM lesson_completions WHERE lesson_id = ?', lessonId);
  if (already) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO lesson_completions (lesson_id, completed_at) VALUES (?, ?)', lessonId, now);
    const percent = await computePercent(lesson.course_id);
    await db.runAsync(
      `INSERT INTO course_progress (course_id, percent, last_lesson_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(course_id) DO UPDATE SET percent = max(course_progress.percent, excluded.percent),
         last_lesson_id = excluded.last_lesson_id, updated_at = excluded.updated_at`,
      lesson.course_id,
      percent,
      lessonId,
      now,
    );
    // The server recomputes the course % from completions; no separate PROGRESS_UPDATED needed.
    await enqueue(db, 'LESSON_COMPLETED', { lessonId, completedAt: now });
  });
  changed();
}

// ─────────────────────────── Quizzes ───────────────────────────

export async function listQuizzes(): Promise<QuizSummary[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT q.id, q.course_id, q.title, count(qq.id) AS n, coalesce(c.title, q.course_id) AS course_title, c.icon
       FROM quizzes q
       JOIN quiz_questions qq ON qq.quiz_id = q.id
       LEFT JOIN courses c ON c.id = q.course_id
      GROUP BY q.id ORDER BY c.sort_order, q.title`,
  );
  return rows.map((r) => ({ id: r.id, courseId: r.course_id, title: r.title, questionCount: r.n, courseTitle: r.course_title, icon: r.icon }));
}

export async function getQuiz(quizId: string) {
  const quiz = await db.getFirstAsync<{ id: string; title: string; course_id: string }>(
    'SELECT id, title, course_id FROM quizzes WHERE id = ?',
    quizId,
  );
  if (!quiz) return null;
  const rows = await db.getAllAsync<any>('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position', quizId);
  const questions: QuizQuestion[] = rows.map((r) => ({
    id: r.id,
    position: r.position,
    prompt: r.prompt,
    options: JSON.parse(r.options_json),
    correctIndex: r.correct_index,
    explanation: r.explanation,
  }));
  return { id: quiz.id, title: quiz.title, courseId: quiz.course_id, questions };
}

/** Scores locally (works offline); the server re-scores on sync and keeps both. */
export async function recordQuizAttempt(
  quizId: string,
  questions: QuizQuestion[],
  answers: { questionId: string; selectedIndex: number }[],
  startedAt: string,
) {
  const correct = new Map(questions.map((q) => [q.id, q.correctIndex]));
  const score = answers.filter((a) => correct.get(a.questionId) === a.selectedIndex).length;
  const attemptId = Crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO quiz_attempts (id, quiz_id, answers_json, score, total, started_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      attemptId,
      quizId,
      JSON.stringify(answers),
      score,
      questions.length,
      startedAt,
      submittedAt,
    );
    await enqueue(db, 'QUIZ_ATTEMPT_CREATED', {
      attemptId, quizId, answers, clientScore: score, total: questions.length, startedAt, submittedAt,
    });
  });
  changed();
  return { score, total: questions.length };
}

// ─────────────────────────── Notes ───────────────────────────

export async function getNote(lessonId: string) {
  return db.getFirstAsync<{ id: string; text: string; updated_at: string }>(
    'SELECT id, text, updated_at FROM notes WHERE lesson_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
    lessonId,
  );
}

export async function saveNote(lessonId: string, text: string) {
  const existing = await getNote(lessonId);
  const now = new Date().toISOString();
  const trimmed = text.trim();
  await db.withTransactionAsync(async () => {
    if (!trimmed) {
      if (!existing) return;
      await db.runAsync('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, existing.id);
      await enqueue(db, 'NOTE_DELETED', { noteId: existing.id, deletedAt: now });
      return;
    }
    const id = existing?.id ?? Crypto.randomUUID();
    const createdAt = existing ? (await db.getFirstAsync<{ created_at: string }>('SELECT created_at FROM notes WHERE id = ?', id))!.created_at : now;
    await db.runAsync(
      `INSERT INTO notes (id, lesson_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      id,
      lessonId,
      trimmed,
      createdAt,
      now,
    );
    await enqueue(db, 'NOTE_UPSERTED', { noteId: id, lessonId, text: trimmed, createdAt, updatedAt: now });
  });
  changed();
}

// ─────────────────────────── Dashboard / profile ───────────────────────────

export async function getContinueLearning() {
  const row = await db.getFirstAsync<any>(
    `SELECT cp.course_id, cp.percent, cp.last_lesson_id, coalesce(c.title, cp.course_id) AS title, c.icon,
            l.title AS lesson_title
       FROM course_progress cp
       LEFT JOIN courses c ON c.id = cp.course_id
       LEFT JOIN lessons l ON l.id = cp.last_lesson_id
      ORDER BY cp.updated_at DESC LIMIT 1`,
  );
  if (!row) return null;
  return {
    courseId: row.course_id as string,
    title: row.title as string,
    icon: row.icon as string | null,
    percent: row.percent as number,
    lastLessonId: row.last_lesson_id as string | null,
    lastLessonTitle: row.lesson_title as string | null,
  };
}

export async function getLearningStats() {
  const row = await db.getFirstAsync<{ started: number; completed: number; avg: number | null; lessons: number; attempts: number }>(
    `SELECT (SELECT count(*) FROM course_progress) AS started,
            (SELECT count(*) FROM course_progress WHERE percent >= 100) AS completed,
            (SELECT avg(percent) FROM course_progress) AS avg,
            (SELECT count(*) FROM lesson_completions) AS lessons,
            (SELECT count(*) FROM quiz_attempts) AS attempts`,
  );
  return {
    coursesStarted: row?.started ?? 0,
    coursesCompleted: row?.completed ?? 0,
    averagePercent: Math.round(row?.avg ?? 0),
    lessonsCompleted: row?.lessons ?? 0,
    quizAttempts: row?.attempts ?? 0,
  };
}

/** Wipes this student's local learning record (used on logout). Downloaded content is kept. */
export async function clearStudentData() {
  await db.execAsync(`
    DELETE FROM lesson_completions;
    DELETE FROM course_progress;
    DELETE FROM quiz_attempts;
    DELETE FROM notes;
    DELETE FROM sync_queue;
    DELETE FROM lp_library;
    DELETE FROM lp_progress;
    DELETE FROM lp_topic_progress;
    DELETE FROM lp_answers;
    DELETE FROM lp_chat;
    DELETE FROM lp_video_progress;
    DELETE FROM study_days;
    DELETE FROM kv WHERE key LIKE 'tutor.session.%' OR key LIKE 'career.%' OR key LIKE 'storage.notice%' OR key LIKE 'reminder.%';
  `);
  useApp.getState().bumpData();
  await refreshPendingCount();
}
