import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { pool, queryOne } from '../../db/pool';
import { HttpError, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';

/**
 * Generic tracker for long-running, non-interactive work (career guidance refresh,
 * pack generation, etc). Runs in-process — this is a single Node server, not a
 * multi-worker fleet, so a separate queue/broker would be infrastructure with no
 * job to do. What actually matters (and what a queue would give you) is here:
 * the `tasks` table is the durable source of truth for status/progress, so it
 * survives a restart and is visible from any device, instead of living only in
 * memory on whichever request handled it.
 */
export type TaskType =
  | 'LEARNING_PACK_GENERATION'
  | 'CAREER_GUIDANCE';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type Task = {
  id: string;
  userId: string;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  progressDone: number;
  progressTotal: number;
  progressLabel: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type TaskRow = {
  id: string;
  user_id: string;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  progress_done: number;
  progress_total: number;
  progress_label: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  status: r.status,
  payload: r.payload,
  progressDone: r.progress_done,
  progressTotal: r.progress_total,
  progressLabel: r.progress_label,
  result: r.result,
  error: r.error,
  retryCount: r.retry_count,
  createdAt: r.created_at.toISOString(),
  startedAt: r.started_at?.toISOString() ?? null,
  completedAt: r.completed_at?.toISOString() ?? null,
});

/** Jobs actually running in this process, so cancelTask can signal them. Keyed by task id. */
const inProcess = new Map<string, { cancelled: boolean }>();
/** Keyed by task id; resolves when the background job finishes. For tests and graceful shutdown. */
const running = new Map<string, Promise<void>>();

/** For tests: wait for a background task to finish instead of polling. No-op once it has. */
export function waitForTask(taskId: string): Promise<void> {
  return running.get(taskId) ?? Promise.resolve();
}

export async function createTask(userId: string, type: TaskType, payload: Record<string, unknown>): Promise<Task> {
  const id = randomUUID();
  const row = await queryOne<TaskRow>(
    `INSERT INTO tasks (id, user_id, type, payload) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, userId, type, JSON.stringify(payload)],
  );
  return toTask(row!);
}

export async function getTask(userId: string, taskId: string): Promise<Task> {
  const row = await queryOne<TaskRow>('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
  if (!row) throw notFound('Task');
  return syncIfNeeded(toTask(row));
}

export async function listUserTasks(userId: string, limit = 20): Promise<Task[]> {
  const { rows } = await pool.query<TaskRow>(
    'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return Promise.all(rows.map(toTask).map(syncIfNeeded));
}

export async function setProgress(taskId: string, done: number, total: number, label?: string) {
  await pool.query(
    `UPDATE tasks SET progress_done = $2, progress_total = $3, progress_label = COALESCE($4, progress_label) WHERE id = $1`,
    [taskId, done, total, label ?? null],
  );
}

type PackVersionRow = { status: TaskStatus | 'generating' | 'ready'; modules_done: number; modules_total: number; error: string | null };

/**
 * LEARNING_PACK_GENERATION tasks are a pointer (see generator.ts): that module already
 * owns retries and progress (modules_done/modules_total on generated_pack_versions). This
 * mirrors that live state onto the task row on read, so the unified task list stays
 * accurate without a second progress-reporting path inside the generator.
 */
async function syncPackGenerationTask(task: Task): Promise<Task> {
  const { packId, version } = task.payload as { packId?: string; version?: number };
  if (!packId || !version || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return task;
  const v = await queryOne<PackVersionRow>(
    'SELECT status, modules_done, modules_total, error FROM generated_pack_versions WHERE pack_id = $1 AND version = $2',
    [packId, version],
  );
  if (!v) return task;
  const status: TaskStatus = v.status === 'ready' ? 'completed' : v.status === 'failed' ? 'failed' : 'running';
  if (status === task.status && v.modules_done === task.progressDone) return task;
  const row = await queryOne<TaskRow>(
    `UPDATE tasks SET status = $2, progress_done = $3, progress_total = $4, error = $5,
        started_at = COALESCE(started_at, now()), completed_at = CASE WHEN $2 IN ('completed','failed') THEN now() ELSE completed_at END
      WHERE id = $1 RETURNING *`,
    [task.id, status, v.modules_done, v.modules_total, v.error],
  );
  return toTask(row!);
}

async function syncIfNeeded(task: Task): Promise<Task> {
  return task.type === 'LEARNING_PACK_GENERATION' ? syncPackGenerationTask(task) : task;
}

export async function cancelTask(userId: string, taskId: string): Promise<Task> {
  const row = await queryOne<TaskRow>(
    `UPDATE tasks SET status = 'cancelled', completed_at = now()
      WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running') RETURNING *`,
    [taskId, userId],
  );
  if (!row) {
    const exists = await queryOne('SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (!exists) throw notFound('Task');
    throw new HttpError(409, 'NOT_CANCELLABLE', 'This task already finished.');
  }
  const handle = inProcess.get(taskId);
  if (handle) handle.cancelled = true;
  return toTask(row);
}

/** True once a running job should stop (cancelled from another request/device). Call between steps. */
export function isCancelled(taskId: string): boolean {
  return inProcess.get(taskId)?.cancelled ?? false;
}

const MAX_RETRIES = 3;

/**
 * Runs `work` in the background and tracks it through the task row. Returns immediately
 * (the caller responds to the HTTP request right away); `work` keeps running after that.
 *
 * Retries only on AI_BUSY (the provider's own "try again" signal — see providers.ts);
 * any other error fails the task immediately rather than retrying something that will
 * just fail the same way again.
 */
export function runInBackground(task: Task, work: (taskId: string) => Promise<Record<string, unknown> | void>): void {
  const handle = { cancelled: false };
  inProcess.set(task.id, handle);

  const job = (async () => {
    await pool.query(`UPDATE tasks SET status = 'running', started_at = now() WHERE id = $1`, [task.id]);
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        if (handle.cancelled) return;
        const result = (await work(task.id)) ?? null;
        if (handle.cancelled) return; // cancelled while work() was finishing; don't overwrite with 'completed'
        await pool.query(
          `UPDATE tasks SET status = 'completed', result = $2, completed_at = now() WHERE id = $1`,
          [task.id, result ? JSON.stringify(result) : null],
        );
        return;
      } catch (err) {
        const busy = err instanceof HttpError && err.code === 'AI_BUSY';
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ taskId: task.id, type: task.type, attempt, err: message }, 'background task attempt failed');
        if (handle.cancelled) return;
        if (busy && attempt < MAX_RETRIES) {
          await pool.query('UPDATE tasks SET retry_count = retry_count + 1 WHERE id = $1', [task.id]);
          const details = (err as HttpError).details as { retryAfterMs?: number } | undefined;
          await new Promise((r) => setTimeout(r, env.NODE_ENV === 'test' ? 0 : (details?.retryAfterMs ?? 30_000)));
          continue;
        }
        await pool.query(
          `UPDATE tasks SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`,
          [task.id, message.slice(0, 500)],
        );
        return;
      }
    }
  })().finally(() => {
    inProcess.delete(task.id);
    running.delete(task.id);
  });
  running.set(task.id, job);
}
