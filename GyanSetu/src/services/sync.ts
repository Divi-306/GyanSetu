import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { db, kvGet, kvSet } from '@/db';
import { api, hasSession, NetworkError } from '@/lib/api';
import { getDeviceId } from '@/lib/device';
import { useApp } from '@/stores/appStore';

export type SyncItemType =
  | 'LESSON_COMPLETED'
  | 'PROGRESS_UPDATED'
  | 'QUIZ_ATTEMPT_CREATED'
  | 'NOTE_UPSERTED'
  | 'NOTE_DELETED'
  | 'STORAGE_EVENT';

type SyncResult = { id: string | null; status: 'applied' | 'duplicate' | 'rejected' | 'error'; code?: string; message?: string };

const BATCH_SIZE = 200;
const LAST_PULL_KEY = 'sync.lastPullAt';
const LAST_SYNC_KEY = 'sync.lastSyncAt';

/**
 * Adds an item to the outbox. Call it inside the same transaction as the local
 * write it describes, so a change is never saved without its sync item.
 */
export async function enqueue(tx: SQLiteDatabase, type: SyncItemType, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  await tx.runAsync(
    'INSERT INTO sync_queue (id, type, payload_json, created_at, next_attempt_at) VALUES (?, ?, ?, ?, ?)',
    Crypto.randomUUID(),
    type,
    JSON.stringify(payload),
    now,
    now,
  );
}

export async function refreshPendingCount() {
  const row = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM sync_queue WHERE status = 'PENDING'");
  useApp.getState().setSync({ pendingSyncCount: row?.n ?? 0 });
}

/** Exponential backoff for temporary server errors: 30 s, 1 min, 2 min … capped at 1 h. */
function backoff(retryCount: number) {
  const seconds = Math.min(3600, 30 * 2 ** retryCount);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

let flushing: Promise<void> | null = null;

/** Sends pending outbox items. Safe to call often: concurrent calls share one run. */
export function flush(): Promise<void> {
  flushing ??= doFlush().finally(() => (flushing = null));
  return flushing;
}

async function doFlush() {
  // Guests keep their queue; it is sent under their account once they log in.
  if (!(await hasSession())) return;
  const setSync = useApp.getState().setSync;
  setSync({ syncing: true });
  try {
    const deviceId = await getDeviceId();
    for (;;) {
      const rows = await db.getAllAsync<{ id: string; type: string; payload_json: string; created_at: string; retry_count: number }>(
        `SELECT id, type, payload_json, created_at, retry_count FROM sync_queue
          WHERE status = 'PENDING' AND next_attempt_at <= ?
          ORDER BY created_at LIMIT ?`,
        new Date().toISOString(),
        BATCH_SIZE,
      );
      if (rows.length === 0) break;

      const res = await api<{ serverTime: string; results: SyncResult[] }>('/v1/sync/batch', {
        method: 'POST',
        body: {
          deviceId,
          items: rows.map((r) => ({ id: r.id, type: r.type, createdAt: r.created_at, payload: JSON.parse(r.payload_json) })),
        },
        timeoutMs: 30_000,
      });

      const byId = new Map(rows.map((r) => [r.id, r]));
      await db.withTransactionAsync(async () => {
        for (const result of res.results) {
          const row = result.id ? byId.get(result.id) : undefined;
          if (!row) continue;
          if (result.status === 'applied' || result.status === 'duplicate') {
            await db.runAsync("UPDATE sync_queue SET status = 'SYNCED', last_error = NULL WHERE id = ?", row.id);
          } else if (result.status === 'rejected') {
            // Will never succeed: keep it locally for inspection, don't retry.
            await db.runAsync(
              "UPDATE sync_queue SET status = 'FAILED', last_error = ? WHERE id = ?",
              `${result.code ?? 'REJECTED'}: ${result.message ?? ''}`,
              row.id,
            );
          } else {
            await db.runAsync(
              'UPDATE sync_queue SET retry_count = retry_count + 1, next_attempt_at = ?, last_error = ? WHERE id = ?',
              backoff(row.retry_count),
              result.code ?? 'RETRY_LATER',
              row.id,
            );
          }
        }
      });
      if (rows.length < BATCH_SIZE) break;
    }
    // Synced rows have done their job; keep the table small.
    await db.runAsync("DELETE FROM sync_queue WHERE status = 'SYNCED'");
    const now = new Date().toISOString();
    await kvSet(LAST_SYNC_KEY, now);
    setSync({ lastSyncAt: now });
  } catch (err) {
    // Offline or server down: everything stays PENDING and is retried on the next trigger.
    if (!(err instanceof NetworkError)) console.warn('[sync] flush failed', err);
  } finally {
    setSync({ syncing: false });
    await refreshPendingCount();
  }
}

type PullResponse = {
  serverTime: string;
  progress: { courseId: string; percent: number; lastLessonId: string | null; updatedAt: string }[];
  lessonCompletions: { lessonId: string; completedAt: string }[];
  quizAttempts: { id: string; quizId: string; answers: unknown; score: number; total: number; startedAt: string | null; submittedAt: string }[];
  notes: { id: string; lessonId: string; text: string; createdAt: string; updatedAt: string; deletedAt: string | null }[];
};

/**
 * Merges server-side changes (another device, or a reinstall) into SQLite,
 * using the same conflict rules as the server: max progress, append-only
 * attempts, last-write-wins notes.
 */
export async function pull() {
  if (!(await hasSession())) return;
  try {
    const since = await kvGet<string>(LAST_PULL_KEY);
    const res = await api<PullResponse>(`/v1/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`);
    await db.withTransactionAsync(async () => {
      for (const c of res.lessonCompletions) {
        await db.runAsync(
          'INSERT INTO lesson_completions (lesson_id, completed_at) VALUES (?, ?) ON CONFLICT(lesson_id) DO NOTHING',
          c.lessonId,
          c.completedAt,
        );
      }
      for (const p of res.progress) {
        await db.runAsync(
          `INSERT INTO course_progress (course_id, percent, last_lesson_id, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(course_id) DO UPDATE SET
             percent = max(course_progress.percent, excluded.percent),
             last_lesson_id = CASE WHEN excluded.updated_at >= course_progress.updated_at
                                   THEN coalesce(excluded.last_lesson_id, course_progress.last_lesson_id)
                                   ELSE course_progress.last_lesson_id END,
             updated_at = max(course_progress.updated_at, excluded.updated_at)`,
          p.courseId,
          p.percent,
          p.lastLessonId,
          p.updatedAt,
        );
      }
      for (const a of res.quizAttempts) {
        await db.runAsync(
          `INSERT INTO quiz_attempts (id, quiz_id, answers_json, score, total, started_at, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET score = excluded.score, total = excluded.total`,
          a.id,
          a.quizId,
          JSON.stringify(a.answers),
          a.score,
          a.total,
          a.startedAt,
          a.submittedAt,
        );
      }
      for (const n of res.notes) {
        await db.runAsync(
          `INSERT INTO notes (id, lesson_id, text, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at,
             deleted_at = coalesce(excluded.deleted_at, notes.deleted_at)
           WHERE excluded.updated_at > notes.updated_at OR excluded.deleted_at IS NOT NULL`,
          n.id,
          n.lessonId,
          n.text,
          n.createdAt,
          n.updatedAt,
          n.deletedAt,
        );
      }
    });
    await kvSet(LAST_PULL_KEY, res.serverTime);
    useApp.getState().bumpData();
  } catch (err) {
    if (!(err instanceof NetworkError)) console.warn('[sync] pull failed', err);
  }
}

/** Push local changes first, then pull, so the pull reflects them. */
export async function syncNow() {
  await flush();
  await pull();
}

export async function loadSyncState() {
  useApp.getState().setSync({ lastSyncAt: await kvGet<string>(LAST_SYNC_KEY) });
  await refreshPendingCount();
}

/** Called on logout: the next account must not inherit this one's pull cursor. */
export async function resetSyncCursor() {
  await db.runAsync('DELETE FROM kv WHERE key IN (?, ?)', LAST_PULL_KEY, LAST_SYNC_KEY);
}
