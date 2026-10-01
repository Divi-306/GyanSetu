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

  const [progress, completions, attempts, notes] = await Promise.all([
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
