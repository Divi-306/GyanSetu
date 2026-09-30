import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ISSUER = 'gyansetu-api';
const AUDIENCE = 'gyansetu-app';

export type AccessClaims = { sub: string; role: 'student' | 'admin' };

export function signAccessToken(user: { id: string; role: string }): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  }) as jwt.JwtPayload;
  return { sub: String(payload.sub), role: payload.role === 'admin' ? 'admin' : 'student' };
}

/** 384-bit random opaque token (refresh tokens, reset tokens). */
export function newOpaqueToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
