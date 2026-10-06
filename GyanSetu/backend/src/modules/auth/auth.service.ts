import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { pool, withTransaction, type Db } from '../../db/pool';
import { HttpError } from '../../lib/errors';
import { newOpaqueToken, sha256, signAccessToken } from '../../lib/tokens';

export const USER_COLUMNS =
  'id, name, email, phone, role, preferred_language, password_hash, google_sub, created_at';

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'student' | 'admin';
  preferred_language: 'en' | 'hi' | 'mr' | 'bn' | 'ta' | 'te' | 'gu';
  password_hash: string | null;
  google_sub: string | null;
  created_at: Date;
};

export function toPublicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    preferredLanguage: u.preferred_language,
    hasPassword: Boolean(u.password_hash),
    createdAt: u.created_at,
  };
}

// Used so that "unknown user" and "wrong password" take the same time.
export const DUMMY_HASH = bcrypt.hashSync('gyansetu-timing-equaliser', 12);
const REFRESH_GRACE_MS = 2 * 60 * 1000;

export async function issueSession(
  user: { id: string; role: string },
  deviceId: string | undefined,
  familyId: string = randomUUID(),
  db: Db = pool,
) {
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, device_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, sha256(refreshToken), familyId, deviceId ?? null, expiresAt],
  );
  return {
    accessToken: signAccessToken(user),
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
  };
}

type RefreshRow = {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
  role: 'student' | 'admin';
};

export async function rotateRefreshToken(token: string, deviceId?: string) {
  const outcome = await withTransaction(async (db) => {
    const { rows } = await db.query<RefreshRow>(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at, rt.revoked_reason, u.role
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
        FOR UPDATE OF rt`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row) return { kind: 'invalid' as const };
    if (row.expires_at.getTime() < Date.now()) return { kind: 'invalid' as const };

    if (row.revoked_at) {
      // Logged out / password reset / already flagged: simply invalid.
      if (row.revoked_reason !== 'rotated') return { kind: 'invalid' as const };
      const withinGrace = Date.now() - row.revoked_at.getTime() < REFRESH_GRACE_MS;
      if (!withinGrace) {
        // Reuse of an old token: assume theft, kill the whole login.
        await db.query(
          `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'reuse'
            WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        return { kind: 'reused' as const };
      }
    } else {
      await db.query(
        `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'rotated' WHERE id = $1`,
        [row.id],
      );
    }

    const session = await issueSession({ id: row.user_id, role: row.role }, deviceId, row.family_id, db);
    return { kind: 'ok' as const, session };
  });

  if (outcome.kind === 'invalid') {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.');
  }
  if (outcome.kind === 'reused') {
    throw new HttpError(401, 'REFRESH_TOKEN_REUSED', 'Session ended for security. Please log in again.');
  }
  return outcome.session;
}

export async function revokeRefreshToken(token: string) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'logout'
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(token)],
  );
}

export async function revokeAllSessions(userId: string, reason: 'logout' | 'password_reset', db: Db = pool) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
}
