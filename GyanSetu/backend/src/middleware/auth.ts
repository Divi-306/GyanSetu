import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../lib/tokens';
import { HttpError, forbidden, unauthorized } from '../lib/errors';

function readUser(header: string | undefined) {
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    const claims = verifyAccessToken(header.slice(7));
    return { id: claims.sub, role: claims.role };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'TOKEN_EXPIRED', 'Access token expired');
    }
    throw unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const user = readUser(req.headers.authorization);
  if (!user) throw unauthorized();
  req.user = user;
  next();
};

/** Attaches req.user if a valid token is present; never blocks guests. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  if (req.headers.authorization) req.user = readUser(req.headers.authorization);
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') throw forbidden('Admin only');
  next();
};
