import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';

export const app = createApp();

export type Session = { accessToken: string; refreshToken: string; user: { id: string } };

export async function signupUser(): Promise<Session & { email: string; password: string }> {
  const email = `t-${randomUUID()}@example.com`;
  const password = 'password123';
  const res = await request(app)
    .post('/v1/auth/signup')
    .send({ name: 'Test Student', email, password, deviceId: 'test-device' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body, email, password };
}

/** Signs up a user, promotes them to admin, and logs in again so the token carries the role. */
export async function signupAdmin(): Promise<Session> {
  const u = await signupUser();
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.user.id]);
  const res = await request(app).post('/v1/auth/login').send({ identifier: u.email, password: u.password });
  return res.body;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
