import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, bearer, signupUser } from './helpers';

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
});
