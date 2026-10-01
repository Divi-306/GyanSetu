import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, signupUser } from './helpers';

describe('auth', () => {
  it('rotates refresh tokens and tolerates a retry within the grace window', async () => {
    const { refreshToken: a } = await signupUser();
    const r1 = await request(app).post('/v1/auth/refresh').send({ refreshToken: a });
    expect(r1.status).toBe(200);
    const b = r1.body.refreshToken;
    expect(b).not.toBe(a);

    // Within the 2-minute grace window, a retry with A still succeeds (lost-response case).
    const r2 = await request(app).post('/v1/auth/refresh').send({ refreshToken: a });
    expect(r2.status).toBe(200);
  });

  it('never reveals whether an account exists', async () => {
    const res = await request(app).post('/v1/auth/forgot-password').send({ identifier: 'nobody@example.com' });
    expect(res.status).toBe(202);
  });
});
