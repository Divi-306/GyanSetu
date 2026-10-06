import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool';
import { requireAuth } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimits';
import { getGuidance, refreshGuidance, roadmapFor } from './guidance.service';

export const careerRouter = Router();
careerRouter.use(requireAuth);

// ── GET /v1/career/guidance : cached AI guidance (works for the app's offline cache too) ──
careerRouter.get('/guidance', async (req, res) => {
  res.json(await getGuidance(req.user!.id));
});

// ── POST /v1/career/guidance/refresh : regenerate when the learning evidence changed ──
careerRouter.post('/guidance/refresh', aiLimiter, async (req, res) => {
  const { force } = z.object({ force: z.boolean().default(false) }).parse(req.body ?? {});
  res.json(await refreshGuidance(req.user!.id, force));
});

// ── POST /v1/career/roadmap : roadmap for one recommended path ──
careerRouter.post('/roadmap', aiLimiter, async (req, res) => {
  const { path } = z.object({ path: z.string().trim().min(1).max(120) }).parse(req.body);
  res.json({ roadmap: await roadmapFor(req.user!.id, path) });
});

// GET /v1/career/recommendations (legacy: fixed career_paths over the classic courses; kept for old clients)
// Deterministic and explainable: every score comes with the reasons behind it,
// and the same logic can run on the device from local progress.
careerRouter.get('/recommendations', async (req, res) => {
  const userId = req.user!.id;
  const [paths, progress, quiz, profile, courses] = await Promise.all([
    pool.query('SELECT * FROM career_paths ORDER BY id'),
    pool.query('SELECT course_id, percent_complete FROM student_progress WHERE user_id = $1', [userId]),
    pool.query(
      `SELECT q.course_id, round(avg(100.0 * qa.server_score / qa.total))::int AS pct
         FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.user_id = $1 GROUP BY q.course_id`,
      [userId],
    ),
    pool.query('SELECT interests FROM student_profiles WHERE user_id = $1', [userId]),
    pool.query('SELECT id, title FROM courses'),
  ]);

  const pct = new Map(progress.rows.map((r) => [r.course_id as string, r.percent_complete as number]));
  const quizPct = new Map(quiz.rows.map((r) => [r.course_id as string, r.pct as number]));
  const title = new Map(courses.rows.map((r) => [r.id as string, r.title as string]));
  const interests: string[] = (profile.rows[0]?.interests ?? []).map((s: string) => s.toLowerCase());
  const name = (c: string) => title.get(c) ?? c;

  const recommendations = paths.rows
    .filter((p) => (p.course_sequence as string[]).length > 0)
    .map((p) => {
      const seq: string[] = p.course_sequence;
      const completion = Math.round(seq.reduce((s, c) => s + (pct.get(c) ?? 0), 0) / seq.length);
      const scored = seq.filter((c) => quizPct.has(c));
      const quizAvg = scored.length ? Math.round(scored.reduce((s, c) => s + quizPct.get(c)!, 0) / scored.length) : null;
      const interestMatch = (p.interest_tags as string[]).some((t) => interests.includes(t.toLowerCase()));
      const done = seq.filter((c) => (pct.get(c) ?? 0) >= 100);
      const inProgress = seq.filter((c) => (pct.get(c) ?? 0) > 0 && (pct.get(c) ?? 0) < 100);
      const next = seq.find((c) => (pct.get(c) ?? 0) < 100) ?? null;

      const why: string[] = [];
      if (done.length) why.push(`You finished ${done.map(name).join(', ')}.`);
      if (inProgress.length) why.push(`You are learning ${inProgress.map(name).join(', ')}.`);
      if (quizAvg !== null) why.push(`Your quiz average on this path is ${quizAvg}%.`);
      if (interestMatch) why.push('It matches the interests in your profile.');

      const score = completion * 0.6 + (quizAvg ?? 0) * 0.3 + (interestMatch ? 10 : 0);
      return {
        pathId: p.id,
        name: p.name,
        description: p.description,
        skills: p.skills,
        outcomes: p.outcomes,
        completionPercent: completion,
        quizAveragePercent: quizAvg,
        nextStep: next
          ? { courseId: next, title: name(next), text: `Next: ${name(next)}` }
          : { courseId: null, title: null, text: 'Path complete: build 2 projects and start applying.' },
        why: why.length ? why : ['Start the first course on this path to get personalised advice.'],
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  res.json({ generatedAt: new Date().toISOString(), recommendations });
});
