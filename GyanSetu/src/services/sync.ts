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
  | 'STORAGE_EVENT'
  | 'LP_LIBRARY_CHANGED'
  | 'LP_PROGRESS_UPDATED'
  | 'LP_TOPIC_UPDATED'
  | 'LP_ANSWER_RECORDED'
  | 'LP_CHAT_MESSAGE'
  | 'LP_CHAT_CLEARED'
  | 'LP_VIDEO_PROGRESS'
  | 'LP_STUDY_TIME'
  | 'LP_QUIZ_SAVED'
  | 'LP_QUIZ_ATTEMPT';

type SyncResult = { id: string | null; status: 'applied' | 'duplicate' | 'rejected' | 'error'; code?: string; message?: string };

const BATCH_SIZE = 200;
/** Stay well under the API's 1 MB body limit: long tutor replies make some items large. */
const BATCH_MAX_CHARS = 600_000;
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

      // Oldest first, as many as fit; always at least one so a large item can't block the queue.
      let size = 0;
      const batch = rows.filter((r, i) => (size += r.payload_json.length + 200) <= BATCH_MAX_CHARS || i === 0);
      const trimmed = batch.length < rows.length;

      const res = await api<{ serverTime: string; results: SyncResult[] }>('/v1/sync/batch', {
        method: 'POST',
        body: {
          deviceId,
          items: batch.map((r) => ({ id: r.id, type: r.type, createdAt: r.created_at, payload: JSON.parse(r.payload_json) })),
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
      if (rows.length < BATCH_SIZE && !trimmed) break;
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
  packLibrary?: { packId: string; version: number; state: 'active' | 'deleted'; updatedAt: string; title: string; icon: string; level: string; latestReadyVersion: number | null }[];
  packProgress?: { packId: string; percent: number; currentTopicId: string | null; updatedAt: string }[];
  packTopics?: { packId: string; topicId: string; completedAt: string | null; bookmarked: boolean; bookmarkUpdatedAt: string | null; timeSpentSec: number }[];
  packAnswers?: { id: string; packId: string; packVersion: number; topicId: string; itemId: string; kind: string; correct: boolean; score: number; answeredAt: string }[];
  packChat?: { id: string; packId: string; role: 'user' | 'tutor'; text: string; meta: unknown; createdAt: string }[];
  packChatClears?: { packId: string; clearedAt: string }[];
  packVideoProgress?: { packId: string; videoId: string; positionSec: number; durationSec: number | null; completedAt: string | null; updatedAt: string }[];
  studyDays?: { day: string; seconds: number }[];
  packQuizzes?: {
    id: string; packId: string; packVersion: number; subject: string; difficulty: string; topicIds: string[];
    questions: { id: string; topicId: string; question: string; options: string[]; correctIndex: number; explanation: string; difficulty: string }[];
    source: string; createdAt: string;
  }[];
  packQuizAttempts?: {
    id: string; quizId: string; packId: string; answers: { questionId: string; selectedIndex: number }[]; score: number; total: number;
    correctCount: number; wrongCount: number; weakTopicIds: string[]; timeTakenSec: number; startedAt: string | null; submittedAt: string;
  }[];
};

/** Server timestamps arrive in any ISO form; local rows compare as strings, so normalise. */
const iso = (s: string | null) => (s ? new Date(s).toISOString() : null);

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

      // ── Learning packs: same merge rules as the server ──
      for (const l of res.packLibrary ?? []) {
        await db.runAsync(
          `INSERT INTO lp_library (pack_id, version, state, title, icon, level, latest_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(pack_id) DO UPDATE SET title = excluded.title, icon = excluded.icon, latest_version = excluded.latest_version,
             version = CASE WHEN excluded.updated_at >= lp_library.updated_at THEN excluded.version ELSE lp_library.version END,
             state = CASE WHEN excluded.updated_at >= lp_library.updated_at THEN excluded.state ELSE lp_library.state END,
             updated_at = max(lp_library.updated_at, excluded.updated_at)`,
          l.packId, l.version, l.state, l.title, l.icon, l.level, l.latestReadyVersion, iso(l.updatedAt),
        );
      }
      for (const p of res.packProgress ?? []) {
        await db.runAsync(
          `INSERT INTO lp_progress (pack_id, percent, current_topic_id, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(pack_id) DO UPDATE SET
             percent = max(lp_progress.percent, excluded.percent),
             current_topic_id = CASE WHEN excluded.updated_at >= lp_progress.updated_at
                                     THEN coalesce(excluded.current_topic_id, lp_progress.current_topic_id)
                                     ELSE lp_progress.current_topic_id END,
             updated_at = max(lp_progress.updated_at, excluded.updated_at)`,
          p.packId, p.percent, p.currentTopicId, iso(p.updatedAt),
        );
      }
      for (const t of res.packTopics ?? []) {
        await db.runAsync(
          `INSERT INTO lp_topic_progress (pack_id, topic_id, completed_at, bookmarked, bookmark_updated_at, time_spent_sec)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(pack_id, topic_id) DO UPDATE SET
             completed_at = CASE WHEN lp_topic_progress.completed_at IS NULL THEN excluded.completed_at
                                 WHEN excluded.completed_at IS NULL THEN lp_topic_progress.completed_at
                                 ELSE min(lp_topic_progress.completed_at, excluded.completed_at) END,
             bookmarked = CASE WHEN excluded.bookmark_updated_at IS NOT NULL
                                    AND (lp_topic_progress.bookmark_updated_at IS NULL OR excluded.bookmark_updated_at > lp_topic_progress.bookmark_updated_at)
                               THEN excluded.bookmarked ELSE lp_topic_progress.bookmarked END,
             bookmark_updated_at = CASE WHEN excluded.bookmark_updated_at IS NULL THEN lp_topic_progress.bookmark_updated_at
                                        WHEN lp_topic_progress.bookmark_updated_at IS NULL THEN excluded.bookmark_updated_at
                                        ELSE max(lp_topic_progress.bookmark_updated_at, excluded.bookmark_updated_at) END,
             time_spent_sec = max(lp_topic_progress.time_spent_sec, excluded.time_spent_sec)`,
          t.packId, t.topicId, iso(t.completedAt), t.bookmarked ? 1 : 0, iso(t.bookmarkUpdatedAt), t.timeSpentSec,
        );
      }
      for (const a of res.packAnswers ?? []) {
        await db.runAsync(
          `INSERT INTO lp_answers (id, pack_id, pack_version, topic_id, item_id, kind, correct, score, answered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
          a.id, a.packId, a.packVersion, a.topicId, a.itemId, a.kind, a.correct ? 1 : 0, a.score, iso(a.answeredAt),
        );
      }
      // Clears first: they remove everything up to their time, then newer messages are added.
      for (const c of res.packChatClears ?? []) {
        await db.runAsync('DELETE FROM lp_chat WHERE pack_id = ? AND created_at < ?', c.packId, iso(c.clearedAt));
      }
      for (const v of res.packVideoProgress ?? []) {
        await db.runAsync(
          `INSERT INTO lp_video_progress (pack_id, video_id, position_sec, duration_sec, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(pack_id, video_id) DO UPDATE SET
             position_sec = CASE WHEN excluded.updated_at >= lp_video_progress.updated_at THEN excluded.position_sec ELSE lp_video_progress.position_sec END,
             duration_sec = coalesce(excluded.duration_sec, lp_video_progress.duration_sec),
             completed_at = CASE WHEN lp_video_progress.completed_at IS NULL THEN excluded.completed_at
                                 WHEN excluded.completed_at IS NULL THEN lp_video_progress.completed_at
                                 ELSE min(lp_video_progress.completed_at, excluded.completed_at) END,
             updated_at = max(lp_video_progress.updated_at, excluded.updated_at)`,
          v.packId, v.videoId, v.positionSec, v.durationSec, iso(v.completedAt), iso(v.updatedAt),
        );
      }
      // The server sends totals across devices: keep whichever is larger.
      for (const d of res.studyDays ?? []) {
        await db.runAsync(
          'INSERT INTO study_days (day, seconds) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET seconds = max(study_days.seconds, excluded.seconds)',
          d.day, d.seconds,
        );
      }
      for (const q of res.packQuizzes ?? []) {
        await db.runAsync(
          `INSERT INTO lp_quizzes (pack_id, id, subject, difficulty, topic_ids_json, source, pack_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(pack_id, id) DO NOTHING`,
          q.packId, q.id, q.subject, q.difficulty, JSON.stringify(q.topicIds), q.source, q.packVersion, iso(q.createdAt),
        );
        for (const [i, item] of q.questions.entries()) {
          await db.runAsync(
            `INSERT INTO lp_quiz_questions (pack_id, quiz_id, id, position, topic_id, question, options_json, correct_index, explanation, difficulty)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(pack_id, quiz_id, id) DO NOTHING`,
            q.packId, q.id, item.id, i, item.topicId, item.question, JSON.stringify(item.options), item.correctIndex, item.explanation, item.difficulty,
          );
        }
      }
      for (const a of res.packQuizAttempts ?? []) {
        await db.runAsync(
          `INSERT INTO lp_quiz_attempts (pack_id, quiz_id, id, answers_json, score, total, correct_count, wrong_count, weak_topics_json, time_taken_sec, started_at, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(pack_id, quiz_id, id) DO NOTHING`,
          a.packId, a.quizId, a.id, JSON.stringify(a.answers), a.score, a.total, a.correctCount, a.wrongCount,
          JSON.stringify(a.weakTopicIds), a.timeTakenSec, iso(a.startedAt), iso(a.submittedAt),
        );
      }
      for (const m of res.packChat ?? []) {
        await db.runAsync(
          `INSERT INTO lp_chat (id, pack_id, role, text, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          m.id, m.packId, m.role, m.text, m.meta ? JSON.stringify(m.meta) : null, iso(m.createdAt),
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
