import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { app, bearer, signupUser } from './helpers';

const sync = (token: string, items: unknown[]) =>
  request(app).post('/v1/sync/batch').set(bearer(token)).send({ deviceId: 'test-device', items });

describe('POST /v1/sync/batch', () => {
  it('is idempotent and keeps max progress', async () => {
    const { accessToken } = await signupUser();
    const { rows } = await pool.query("SELECT id FROM lessons WHERE course_id = 'python' ORDER BY position LIMIT 1");
    const now = new Date().toISOString();

    const items = [
      { id: randomUUID(), type: 'LESSON_COMPLETED', createdAt: now, payload: { lessonId: rows[0].id, completedAt: now } },
      { id: randomUUID(), type: 'PROGRESS_UPDATED', createdAt: now, payload: { courseId: 'python', percent: 70, updatedAt: now } },
      { id: randomUUID(), type: 'PROGRESS_UPDATED', createdAt: now, payload: { courseId: 'python', percent: 40, updatedAt: now } },
    ];

    const first = await sync(accessToken, items);
    expect(first.status).toBe(200);
    expect(first.body.results.map((r: any) => r.status)).toEqual(['applied', 'applied', 'applied']);

    const second = await sync(accessToken, items);
    expect(second.body.results.every((r: any) => r.status === 'duplicate')).toBe(true);

    const progress = await request(app).get('/v1/progress').set(bearer(accessToken));
    expect(progress.body.courses[0]).toMatchObject({
      courseId: 'python',
      percent: 70,
      lastLessonTitle: 'Introduction to Python',
    });
  });

  it('rejects unknown references and invalid items without failing the batch', async () => {
    const { accessToken } = await signupUser();
    const now = new Date().toISOString();
    const res = await sync(accessToken, [
      { id: randomUUID(), type: 'LESSON_COMPLETED', createdAt: now, payload: { lessonId: randomUUID(), completedAt: now } },
      { id: randomUUID(), type: 'NOT_A_TYPE', createdAt: now, payload: {} },
      {
        id: randomUUID(), type: 'STORAGE_EVENT', createdAt: now,
        payload: { courseId: 'python', packVersion: 1, eventType: 'archived', occurredAt: now },
      },
    ]);
    expect(res.body.results[0]).toMatchObject({ status: 'rejected', code: 'UNKNOWN_REFERENCE' });
    expect(res.body.results[1]).toMatchObject({ status: 'rejected', code: 'INVALID_ITEM' });
    expect(res.body.results[2].status).toBe('applied');
  });

  it('re-scores quiz attempts on the server; repeated answers cannot inflate the score', async () => {
    const { accessToken, user } = await signupUser();
    const { rows: qs } = await pool.query(
      `SELECT qq.quiz_id, qq.id, qq.correct_index FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
        WHERE q.course_id = 'python' ORDER BY qq.position`,
    );
    const right = qs[0];
    const attemptId = randomUUID();
    const now = new Date().toISOString();
    const res = await sync(accessToken, [
      {
        id: randomUUID(), type: 'QUIZ_ATTEMPT_CREATED', createdAt: now,
        payload: {
          attemptId, quizId: right.quiz_id, clientScore: 5, total: 5, submittedAt: now,
          // The same correct answer five times: only the first counts.
          answers: Array.from({ length: 5 }, () => ({ questionId: right.id, selectedIndex: right.correct_index })),
        },
      },
    ]);
    expect(res.body.results[0].status).toBe('applied');
    const { rows } = await pool.query(
      'SELECT client_score, server_score, total FROM quiz_attempts WHERE id = $1 AND user_id = $2',
      [attemptId, user.id],
    );
    expect(rows[0]).toEqual({ client_score: 5, server_score: 1, total: 5 });
  });

  it('applies notes last-write-wins, then tombstones them', async () => {
    const { accessToken } = await signupUser();
    const { rows } = await pool.query("SELECT id FROM lessons WHERE course_id = 'dsa' LIMIT 1");
    const noteId = randomUUID();
    const t0 = '2026-10-01T09:00:00Z';
    const t1 = '2026-10-01T10:00:00Z';
    const t2 = '2026-10-01T11:00:00Z';
    const upsert = (text: string, updatedAt: string) => ({
      id: randomUUID(), type: 'NOTE_UPSERTED', createdAt: updatedAt,
      payload: { noteId, lessonId: rows[0].id, text, createdAt: t0, updatedAt },
    });
    await sync(accessToken, [upsert('newer', t1), upsert('older', t0)]);

    let pull = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    expect(pull.body.notes).toMatchObject([{ id: noteId, text: 'newer', deletedAt: null }]);

    await sync(accessToken, [{ id: randomUUID(), type: 'NOTE_DELETED', createdAt: t2, payload: { noteId, deletedAt: t2 } }]);
    pull = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    expect(pull.body.notes[0].deletedAt).not.toBeNull();
  });

  it('pull returns everything, then only recent rows with ?since', async () => {
    const { accessToken } = await signupUser();
    const { rows } = await pool.query("SELECT id FROM lessons WHERE course_id = 'cn' ORDER BY position");
    const now = new Date().toISOString();
    await sync(accessToken, [
      { id: randomUUID(), type: 'LESSON_COMPLETED', createdAt: now, payload: { lessonId: rows[0].id, completedAt: now } },
    ]);

    const all = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    expect(all.body.lessonCompletions).toHaveLength(1);
    expect(all.body.progress[0]).toMatchObject({ courseId: 'cn', percent: 50 });

    // A 'since' past the overlap window sees nothing new.
    const later = new Date(Date.now() + 5 * 60_000).toISOString();
    const none = await request(app).get('/v1/sync/pull').set(bearer(accessToken)).query({ since: later });
    expect(none.body.lessonCompletions).toHaveLength(0);

    const status = await request(app).get('/v1/sync/status').set(bearer(accessToken));
    expect(status.body.itemsReceived).toBe(1);
  });
});
