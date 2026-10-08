import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { cancelTask, getTask, listUserTasks } from './taskManager';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const taskDto = (t: Awaited<ReturnType<typeof getTask>>) => ({
  id: t.id,
  type: t.type,
  status: t.status,
  progress: { done: t.progressDone, total: t.progressTotal, label: t.progressLabel },
  result: t.result,
  error: t.error,
  createdAt: t.createdAt,
  startedAt: t.startedAt,
  completedAt: t.completedAt,
});

// ── GET /v1/tasks : the student's background work, newest first ──
tasksRouter.get('/', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
  const tasks = await listUserTasks(req.user!.id, limit);
  res.json({ tasks: tasks.map(taskDto) });
});

// ── GET /v1/tasks/:id : poll one task's status/progress ──
tasksRouter.get('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  res.json({ task: taskDto(await getTask(req.user!.id, id)) });
});

// ── POST /v1/tasks/:id/cancel ──
tasksRouter.post('/:id/cancel', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  res.json({ task: taskDto(await cancelTask(req.user!.id, id)) });
});
