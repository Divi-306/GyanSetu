import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, bearer, signupUser } from './helpers';

describe('catalog', () => {
  it('lists the 5 published courses with pack sizes', async () => {
    const res = await request(app).get('/v1/courses');
    expect(res.status).toBe(200);
    expect(res.body.courses.map((c: any) => c.id)).toEqual(['python', 'dbms', 'cn', 'os', 'dsa']);
    for (const c of res.body.courses) {
      expect(typeof c.fullSizeBytes).toBe('number');
      expect(c.packVersion).toBeGreaterThanOrEqual(1);
    }
  });

  it('searches by title, and treats LIKE wildcards literally', async () => {
    const net = await request(app).get('/v1/courses').query({ q: 'net' });
    expect(net.body.courses.map((c: any) => c.id)).toEqual(['cn']);
    const pct = await request(app).get('/v1/courses').query({ q: '%' });
    expect(pct.body.courses).toEqual([]);
  });

  it('serves the starter bundle without a token, including starter-only subjects', async () => {
    const res = await request(app).get('/v1/starter-bundle');
    expect(res.status).toBe(200);
    expect(res.body.pack.packId).toBeTruthy();
    expect(res.body.courses.map((c: any) => c.id).sort()).toEqual(['cn', 'dbms', 'dsa', 'os', 'programming']);
    expect(res.body.courses.every((c: any) => c.hasQuiz)).toBe(true);
  });

  it('hides starter-only courses from the catalog', async () => {
    expect((await request(app).get('/v1/courses/programming')).status).toBe(404);
  });

  it('requires login for full course packs', async () => {
    expect((await request(app).get('/v1/courses/python/pack')).status).toBe(401);
    const { accessToken } = await signupUser();
    const res = await request(app).get('/v1/courses/python/pack').set(bearer(accessToken)).query({ variant: 'lite' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ courseId: 'python', variant: 'lite' });
    expect(res.body.manifestUrl).toBe(`/v1/packs/${res.body.packId}/manifest`);
  });
});
