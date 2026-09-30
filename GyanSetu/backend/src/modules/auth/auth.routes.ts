import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { pool, queryOne, withTransaction } from '../../db/pool';
import { HttpError, badRequest, conflict } from '../../lib/errors';
import { normalizePhone, parseIdentifier } from '../../lib/identifiers';
import { newOpaqueToken, sha256 } from '../../lib/tokens';
import { sendMail } from '../../lib/mailer';
import { authLimiter } from '../../middleware/rateLimits';
import { requireAuth } from '../../middleware/auth';
import {
  DUMMY_HASH,
  USER_COLUMNS,
  issueSession,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  toPublicUser,
  type UserRow,
} from './auth.service';

export const authRouter = Router();
const googleClient = new OAuth2Client();

const Password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const DeviceId = z.string().min(1).max(100).optional();

// ── POST /v1/auth/signup ──────────────────────────────────────────────
const SignupBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email().optional(),
    phone: z.string().optional(),
    password: Password,
    preferredLanguage: z.enum(['en', 'hi']).default('en'),
    deviceId: DeviceId,
  })
  .refine((b) => b.email || b.phone, { message: 'Email or phone is required', path: ['email'] });

authRouter.post('/signup', authLimiter, async (req, res) => {
  const body = SignupBody.parse(req.body);
  const email = body.email?.toLowerCase() ?? null;
  const phone = body.phone ? normalizePhone(body.phone) : null;
  const passwordHash = await bcrypt.hash(body.password, 12);

  const result = await withTransaction(async (db) => {
    const existing = await queryOne(
      'SELECT 1 FROM users WHERE email = $1 OR phone = $2',
      [email, phone],
      db,
    );
    if (existing) throw conflict('ACCOUNT_EXISTS', 'An account with this email or phone already exists');

    const user = (await queryOne<UserRow>(
      `INSERT INTO users (name, email, phone, password_hash, preferred_language)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
      [body.name, email, phone, passwordHash, body.preferredLanguage],
      db,
    ))!;
    await db.query('INSERT INTO student_profiles (user_id) VALUES ($1)', [user.id]);
    const session = await issueSession(user, body.deviceId, undefined, db);
    return { user, session };
  });

  res.status(201).json({ user: toPublicUser(result.user), ...result.session });
});

// ── POST /v1/auth/login ───────────────────────────────────────────────
const LoginBody = z.object({
  identifier: z.string().min(3).max(120),
  password: z.string().min(1).max(128),
  deviceId: DeviceId,
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = LoginBody.parse(req.body);
  const id = parseIdentifier(body.identifier);
  const user = await queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE ${id.kind === 'email' ? 'email' : 'phone'} = $1`,
    [id.value],
  );

  const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || !ok) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email/phone or password');
  }

  const session = await issueSession(user, body.deviceId);
  res.json({ user: toPublicUser(user), ...session });
});

// ── POST /v1/auth/google ──────────────────────────────────────────────
const GoogleBody = z.object({ idToken: z.string().min(10), deviceId: DeviceId });

authRouter.post('/google', authLimiter, async (req, res) => {
  const body = GoogleBody.parse(req.body);
  const audience = env.GOOGLE_CLIENT_IDS.split(',').map((s) => s.trim()).filter(Boolean);
  if (audience.length === 0) throw new HttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not enabled');

  const ticket = await googleClient
    .verifyIdToken({ idToken: body.idToken, audience })
    .catch(() => {
      throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in failed');
    });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email || !p.email_verified) {
    throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Google account email is not verified');
  }

  const user = await withTransaction(async (db) => {
    const bySub = await queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = $1`, [p.sub], db);
    if (bySub) return bySub;

    const byEmail = await queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [p.email], db);
    if (byEmail) {
      // Link Google to the existing (verified-email) account.
      return (await queryOne<UserRow>(
        `UPDATE users SET google_sub = $2, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
          WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [byEmail.id, p.sub],
        db,
      ))!;
    }

    const created = (await queryOne<UserRow>(
      `INSERT INTO users (name, email, google_sub, email_verified_at)
       VALUES ($1, $2, $3, now()) RETURNING ${USER_COLUMNS}`,
      [p.name ?? p.email!.split('@')[0], p.email!.toLowerCase(), p.sub],
      db,
    ))!;
    await db.query('INSERT INTO student_profiles (user_id) VALUES ($1)', [created.id]);
    return created;
  });

  const session = await issueSession(user, body.deviceId);
  res.json({ user: toPublicUser(user), ...session });
});

// ── POST /v1/auth/refresh ─────────────────────────────────────────────
const RefreshBody = z.object({ refreshToken: z.string().min(20), deviceId: DeviceId });

authRouter.post('/refresh', async (req, res) => {
  const body = RefreshBody.parse(req.body);
  res.json(await rotateRefreshToken(body.refreshToken, body.deviceId));
});

// ── POST /v1/auth/logout ──────────────────────────────────────────────
authRouter.post('/logout', async (req, res) => {
  const body = z.object({ refreshToken: z.string().min(20) }).parse(req.body);
  await revokeRefreshToken(body.refreshToken);
  res.status(204).end();
});

// ── POST /v1/auth/logout-all ─────────────────────────────────────────
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(req.user!.id, 'logout');
  res.status(204).end();
});

// ── POST /v1/auth/forgot-password ────────────────────────────────────
const GENERIC_RESET_REPLY = {
  message: "If an account exists for this email or phone, you'll receive instructions to reset your password.",
};

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const body = z.object({ identifier: z.string().min(3).max(120) }).parse(req.body);
  let id;
  try {
    id = parseIdentifier(body.identifier);
  } catch {
    res.status(202).json(GENERIC_RESET_REPLY);
    return;
  }

  const user = await queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE ${id.kind === 'email' ? 'email' : 'phone'} = $1`,
    [id.value],
  );

  if (user?.email) {
    const token = newOpaqueToken();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 minutes')`,
      [user.id, sha256(token)],
    );
    const link = `${env.APP_RESET_URL}?token=${encodeURIComponent(token)}`;
    await sendMail(
      user.email,
      'Reset your GyanSetu password',
      `Hi ${user.name},\n\nOpen this link on your phone to reset your password (valid 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    );
  }
  // Phone-only accounts: plug in an SMS OTP provider (MSG91 / Twilio) here later.

  res.status(202).json(GENERIC_RESET_REPLY);
});

// ── POST /v1/auth/reset-password ─────────────────────────────────────
const ResetBody = z.object({ token: z.string().min(20), newPassword: Password });

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const body = ResetBody.parse(req.body);
  const hash = await bcrypt.hash(body.newPassword, 12);

  await withTransaction(async (db) => {
    const row = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [sha256(body.token)],
      db,
    );
    if (!row) throw badRequest('INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');

    await db.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
    await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [row.user_id, hash]);
    await revokeAllSessions(row.user_id, 'password_reset', db);
  });

  res.json({ message: 'Password updated. Please log in again.' });
});
