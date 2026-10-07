import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/pool';
import { logger } from '../../lib/logger';
import { requireAuth } from '../../middleware/auth';
import { syncLimiter } from '../../middleware/rateLimits';
import { SyncRejection, applySyncItem } from './sync.handlers';
import { SyncBatchBody, SyncItem, type SyncResult } from './sync.schemas';

export const syncRouter = Router();
syncRouter.use(requireAuth);

// received_at is the writing transaction's start time, so a sync that began
// just before a pull but committed just after it would be invisible to
// `received_at > since`. Re-reading a short overlap closes that gap; every
// pulled row is keyed by id and merges idempotently on the device.
const PULL_OVERLAP_MS = 60_000;
const CHAT_PULL_LIMIT = 100;

async function processItem(userId: string, deviceId: string, item: SyncItem): Promise<SyncResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO sync_events (id, user_id, device_id, type, client_created_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [item.id, userId, deviceId, item.type, item.createdAt],
    );
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return { id: item.id, status: 'duplicate' };
    }
    await applySyncItem(client, userId, item);
    await client.query('COMMIT');
    return { id: item.id, status: 'applied' };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof SyncRejection) {
      return { id: item.id, status: 'rejected', code: err.code, message: err.message };
    }
    if (err?.code === '23503') {
      return { id: item.id, status: 'rejected', code: 'UNKNOWN_REFERENCE', message: 'Referenced lesson/quiz/course does not exist' };
    }
    logger.error({ err, itemId: item.id, type: item.type }, 'sync item failed');
    return { id: item.id, status: 'error', code: 'RETRY_LATER' };
  } finally {
    client.release();
  }
}

// ── POST /v1/sync/batch ──────────────────────────────────────────────
syncRouter.post('/batch', syncLimiter, async (req, res) => {
  const { deviceId, items } = SyncBatchBody.parse(req.body);
  const results: SyncResult[] = [];

  // Sequential on purpose: preserves the client's ordering (oldest first).
  for (const raw of items) {
    const parsed = SyncItem.safeParse(raw);
    if (!parsed.success) {
      const id = typeof (raw as any)?.id === 'string' ? (raw as any).id : null;
      results.push({ id, status: 'rejected', code: 'INVALID_ITEM', message: parsed.error.issues[0]?.message });
      continue;
    }
    results.push(await processItem(req.user!.id, deviceId, parsed.data));
  }

  res.json({ serverTime: new Date().toISOString(), results });
});

// ── GET /v1/sync/pull?since=ISO ──────────────────────────────────────
// Restores a student's data after reinstall / on a new phone, and merges
// changes made on another device.
syncRouter.get('/pull', async (req, res) => {
  const { since } = z
    .object({ since: z.iso.datetime({ offset: true }).optional() })
    .parse(req.query);
  const from = since ? new Date(new Date(since).getTime() - PULL_OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
  const userId = req.user!.id;
  const serverTime = new Date().toISOString(); // captured BEFORE reading → no gaps

  const [
    progress, completions, attempts, notes, packLibrary, packProgress, packTopics, packAnswers, packChat, packChatClears,
    packVideos, studyDays, packQuizzes, packQuizAttempts,
  ] = await Promise.all([
    pool.query(
      `SELECT course_id, percent_complete, last_lesson_id, client_updated_at
         FROM student_progress WHERE user_id = $1 AND updated_at > $2`,
      [userId, from],
    ),
    pool.query(
      'SELECT lesson_id, completed_at FROM lesson_completions WHERE user_id = $1 AND received_at > $2',
      [userId, from],
    ),
    pool.query(
      `SELECT id, quiz_id, answers, server_score, total, started_at, submitted_at
         FROM quiz_attempts WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    pool.query(
      `SELECT id, lesson_id, text, created_at, updated_at, deleted_at
         FROM notes WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    pool.query(
      `SELECT l.pack_id, l.version, l.state, l.client_updated_at, p.title, p.icon, p.level, p.latest_ready_version
         FROM pack_library l JOIN generated_packs p ON p.id = l.pack_id
        WHERE l.user_id = $1 AND l.received_at > $2`,
      [userId, from],
    ),
    pool.query(
      `SELECT pack_id, percent, current_topic_id, client_updated_at
         FROM pack_progress WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    pool.query(
      `SELECT pack_id, topic_id, completed_at, bookmarked, bookmark_updated_at, time_spent_sec
         FROM pack_topic_progress WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    pool.query(
      `SELECT id, pack_id, pack_version, topic_id, item_id, kind, correct, score, answered_at
         FROM pack_answers WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    // At most the newest CHAT_PULL_LIMIT messages per pack: a new phone gets recent history, not years of it.
    pool.query(
      `SELECT id, pack_id, role, text, meta, created_at FROM (
         SELECT *, row_number() OVER (PARTITION BY pack_id ORDER BY created_at DESC) AS rn
           FROM pack_chat_messages WHERE user_id = $1 AND received_at > $2) m
        WHERE rn <= $3 ORDER BY created_at`,
      [userId, from, CHAT_PULL_LIMIT],
    ),
    pool.query(
      'SELECT pack_id, cleared_at FROM pack_chat_clears WHERE user_id = $1 AND received_at > $2',
      [userId, from],
    ),
    pool.query(
      `SELECT pack_id, video_id, position_sec, duration_sec, completed_at, client_updated_at
         FROM pack_video_progress WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    // Totals, not deltas: the device keeps the larger of its own count and the server's.
    pool.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, seconds FROM study_days
        WHERE user_id = $1 AND received_at > $2 AND day > current_date - 400`,
      [userId, from],
    ),
    pool.query(
      `SELECT id, pack_id, pack_version, subject, difficulty, topic_ids, questions, source, created_at
         FROM pack_quizzes WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
    pool.query(
      `SELECT id, quiz_id, pack_id, answers, score, total, correct_count, wrong_count, weak_topic_ids, time_taken_sec, started_at, submitted_at
         FROM pack_quiz_attempts WHERE user_id = $1 AND received_at > $2`,
      [userId, from],
    ),
  ]);

  res.json({
    serverTime,
    progress: progress.rows.map((r) => ({
      courseId: r.course_id,
      percent: r.percent_complete,
      lastLessonId: r.last_lesson_id,
      updatedAt: r.client_updated_at,
    })),
    lessonCompletions: completions.rows.map((r) => ({ lessonId: r.lesson_id, completedAt: r.completed_at })),
    quizAttempts: attempts.rows.map((r) => ({
      id: r.id,
      quizId: r.quiz_id,
      answers: r.answers,
      score: r.server_score,
      total: r.total,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
    })),
    notes: notes.rows.map((r) => ({
      id: r.id,
      lessonId: r.lesson_id,
      text: r.text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
    })),
    packLibrary: packLibrary.rows.map((r) => ({
      packId: r.pack_id,
      version: r.version,
      state: r.state,
      updatedAt: r.client_updated_at,
      title: r.title,
      icon: r.icon,
      level: r.level,
      latestReadyVersion: r.latest_ready_version,
    })),
    packProgress: packProgress.rows.map((r) => ({
      packId: r.pack_id,
      percent: r.percent,
      currentTopicId: r.current_topic_id,
      updatedAt: r.client_updated_at,
    })),
    // timeSpentSec is the server's total; the device keeps the larger of its own and this.
    packTopics: packTopics.rows.map((r) => ({
      packId: r.pack_id,
      topicId: r.topic_id,
      completedAt: r.completed_at,
      bookmarked: r.bookmarked,
      bookmarkUpdatedAt: r.bookmark_updated_at,
      timeSpentSec: r.time_spent_sec,
    })),
    packAnswers: packAnswers.rows.map((r) => ({
      id: r.id,
      packId: r.pack_id,
      packVersion: r.pack_version,
      topicId: r.topic_id,
      itemId: r.item_id,
      kind: r.kind,
      correct: r.correct,
      score: r.score,
      answeredAt: r.answered_at,
    })),
    packChat: packChat.rows.map((r) => ({
      id: r.id,
      packId: r.pack_id,
      role: r.role,
      text: r.text,
      meta: r.meta,
      createdAt: r.created_at,
    })),
    packChatClears: packChatClears.rows.map((r) => ({ packId: r.pack_id, clearedAt: r.cleared_at })),
    packVideoProgress: packVideos.rows.map((r) => ({
      packId: r.pack_id,
      videoId: r.video_id,
      positionSec: r.position_sec,
      durationSec: r.duration_sec,
      completedAt: r.completed_at,
      updatedAt: r.client_updated_at,
    })),
    studyDays: studyDays.rows.map((r) => ({ day: r.day, seconds: r.seconds })),
    packQuizzes: packQuizzes.rows.map((r) => ({
      id: r.id,
      packId: r.pack_id,
      packVersion: r.pack_version,
      subject: r.subject,
      difficulty: r.difficulty,
      topicIds: r.topic_ids,
      questions: r.questions,
      source: r.source,
      createdAt: r.created_at,
    })),
    packQuizAttempts: packQuizAttempts.rows.map((r) => ({
      id: r.id,
      quizId: r.quiz_id,
      packId: r.pack_id,
      answers: r.answers,
      score: r.score,
      total: r.total,
      correctCount: r.correct_count,
      wrongCount: r.wrong_count,
      weakTopicIds: r.weak_topic_ids,
      timeTakenSec: r.time_taken_sec,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
    })),
  });
});

// ── GET /v1/sync/status ──────────────────────────────────────────────
syncRouter.get('/status', async (req, res) => {
  const row = await queryOne<{ last_sync_at: Date | null; total: number }>(
    'SELECT max(received_at) AS last_sync_at, count(*)::int AS total FROM sync_events WHERE user_id = $1',
    [req.user!.id],
  );
  res.json({ lastSyncAt: row?.last_sync_at ?? null, itemsReceived: row?.total ?? 0 });
});
