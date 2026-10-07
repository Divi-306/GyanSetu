import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
});

// Keyed by user id (requireAuth runs first on /ai routes).
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'You have asked a lot of questions this hour. Try again later.' } },
});

export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'Syncing too often. Try again in a minute.' } },
});

// AI Navigator: short commands, so a higher budget than the tutor. Guests share by IP.
export const navigatorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many navigator commands. Try again in a few minutes.' } },
});

// Generating a learning pack costs a dozen long model calls: a daily budget per student.
export const packGenerationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: env.PACK_GENERATION_DAILY_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'You have created a lot of learning packs today. Try again tomorrow.' } },
});
