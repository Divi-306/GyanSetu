import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';
import { optionalAuth } from '../../middleware/auth';
import { navigatorLimiter } from '../../middleware/rateLimits';
import { aiConfigured } from '../ai/providers';
import { understandIntent } from './navigator.service';

export const navigatorRouter = Router();

const Slug = z.string().regex(/^[a-z0-9-]+$/).max(60);

const IntentBody = z.object({
  message: z.string().trim().min(1).max(300),
  context: z
    .object({
      route: z.string().max(120).default('/'),
      courses: z.array(z.object({ id: Slug, title: z.string().max(120) })).max(60).default([]),
      screenItems: z.array(z.string().max(120)).max(30).default([]),
      currentCourse: z.object({ id: Slug, title: z.string().max(120) }).nullable().default(null),
    })
    .default({ route: '/', courses: [], screenItems: [], currentCourse: null }),
});

// POST /v1/navigator/intent
// Guests can use it too (the app works without an account); the limiter keys on
// user id when logged in, otherwise on IP. The response is only action names
// and plain words: the app validates and resolves them against its own data.
navigatorRouter.post('/intent', optionalAuth, navigatorLimiter, async (req, res) => {
  const { message, context } = IntentBody.parse(req.body);
  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Online AI is not available right now');
  res.json({ actions: await understandIntent(message, context) });
});
