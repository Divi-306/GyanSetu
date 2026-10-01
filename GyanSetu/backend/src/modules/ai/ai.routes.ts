import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimits';
import { askTutor } from './ai.service';

export const aiRouter = Router();

const AskBody = z.object({
  question: z.string().trim().min(3).max(1000),
  courseId: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

// POST /v1/ai/ask
aiRouter.post('/ask', requireAuth, aiLimiter, async (req, res) => {
  const body = AskBody.parse(req.body);
  res.json(await askTutor({ userId: req.user!.id, question: body.question, courseId: body.courseId }));
});
