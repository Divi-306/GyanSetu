import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { app, bearer, signupAdmin, signupUser } from './helpers';

const RANK = ['likely_eligible', 'check_details', 'not_eligible'];

describe('scholarships', () => {
  it('uses the profile only after consent, and sorts likely matches first', async () => {
    const { accessToken } = await signupUser();
    const profile = {
      dateOfBirth: '2006-05-01', gender: 'female', state: 'Bihar', category: 'SC', annualFamilyIncome: 180000,
      educationLevel: 'diploma', institution: null, currentCourse: null, semester: 2, isPwd: false,
      interests: ['coding'], goals: null,
    };

    const noConsent = await request(app).put('/v1/me/profile').set(bearer(accessToken)).send({ ...profile, dataConsent: false });
    expect(noConsent.status).toBe(200);
    let res = await request(app).get('/v1/scholarships').set(bearer(accessToken));
    expect(res.body.profileComplete).toBe(false);
    expect(res.body.scholarships.some((s: any) => s.match.status === 'likely_eligible')).toBe(false);

    await request(app).put('/v1/me/profile').set(bearer(accessToken)).send({ ...profile, dataConsent: true });
    res = await request(app).get('/v1/scholarships').set(bearer(accessToken));
    expect(res.body.profileComplete).toBe(true);
    expect(res.body.disclaimer).toMatch(/official website/);
    const statuses: string[] = res.body.scholarships.map((s: any) => s.match.status);
    expect(statuses[0]).toBe('likely_eligible');
    expect([...statuses].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))).toEqual(statuses);

    const one = await request(app).get(`/v1/scholarships/${res.body.scholarships[0].id}`).set(bearer(accessToken));
    expect(one.status).toBe(200);
  });
});

describe('career', () => {
  it('returns explainable recommendations with a next step', async () => {
    const { accessToken } = await signupUser();
    const res = await request(app).get('/v1/career/recommendations').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toHaveLength(4);
    for (const r of res.body.recommendations) {
      expect(r.why.length).toBeGreaterThan(0);
      expect(r.nextStep.courseId).toBeTruthy();
    }
  });
});

describe('AI tutor', () => {
  it('returns 503 AI_NOT_CONFIGURED without a key, so the app uses its offline path', async () => {
    const { accessToken } = await signupUser();
    const res = await request(app).post('/v1/ai/ask').set(bearer(accessToken)).send({ question: 'What is a tuple?' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});

describe('admin', () => {
  it('is admin-only', async () => {
    const { accessToken } = await signupUser();
    expect((await request(app).get('/v1/admin/stats').set(bearer(accessToken))).status).toBe(403);
  });

  const id = `t-${randomUUID().slice(0, 8)}`;
  afterAll(async () => {
    // Keep the shared test DB clean for the catalog tests.
    await pool.query('DELETE FROM courses WHERE id = $1', [id]);
    await fs.rm(path.resolve(env.PACK_STORAGE_DIR, id), { recursive: true, force: true });
  });

  it('creates a course, adds content, and publishes pack versions', async () => {
    const { accessToken } = await signupAdmin();
    const auth = bearer(accessToken);

    const course = await request(app).put(`/v1/admin/courses/${id}`).set(auth).send({ title: 'Test Course' });
    expect(course.status).toBe(200);

    // Publishing with no lessons is a clear 400, not a 500.
    const empty = await request(app).post(`/v1/admin/courses/${id}/publish`).set(auth).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('NOTHING_TO_PUBLISH');

    const lesson = await request(app).post(`/v1/admin/courses/${id}/lessons`).set(auth)
      .send({ position: 1, title: 'Lesson One', bodyMd: '# Hello\n\nSome text.' });
    expect(lesson.status).toBe(201);

    const quiz = await request(app).post(`/v1/admin/courses/${id}/quizzes`).set(auth).send({
      title: 'Quiz', questions: [{ prompt: 'Two plus two?', options: ['3', '4'], correctIndex: 1 }],
    });
    expect(quiz.status).toBe(201);

    const pub = await request(app).post(`/v1/admin/courses/${id}/publish`).set(auth).send({ releaseNotes: 'first' });
    expect(pub.status).toBe(200);
    expect(pub.body.packs.map((p: any) => p.variant)).toEqual(['full', 'lite']);

    const pub2 = await request(app).post(`/v1/admin/courses/${id}/publish`).set(auth).send({});
    expect(pub2.body.packs[0].version).toBe(2);

    const listed = await request(app).get('/v1/courses');
    expect(listed.body.courses.find((c: any) => c.id === id)?.packVersion).toBe(2);

    // Lessons for a course that doesn't exist: 400, not a 500.
    const orphan = await request(app).post('/v1/admin/courses/no-such-course/lessons').set(auth)
      .send({ position: 1, title: 'Orphan', bodyMd: 'x' });
    expect(orphan.status).toBe(400);

    const stats = await request(app).get('/v1/admin/stats').set(auth);
    expect(stats.body).toHaveProperty('score_mismatches');
  });
});
