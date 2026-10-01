import { Router } from 'express';
import { pool } from '../../db/pool';
import { requireAuth } from '../../middleware/auth';

export const progressRouter = Router();
progressRouter.use(requireAuth);

// GET /v1/progress: feeds "Continue Learning" on the dashboard.
// Progress is only ever written through /v1/sync/batch (PROGRESS_UPDATED).
progressRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT sp.course_id, c.title, c.icon, sp.percent_complete, sp.last_lesson_id,
            l.title AS last_lesson_title, sp.client_updated_at,
            (SELECT round(avg(100.0 * qa.server_score / qa.total))::int
               FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
              WHERE qa.user_id = sp.user_id AND q.course_id = sp.course_id) AS avg_quiz_percent
       FROM student_progress sp
       JOIN courses c ON c.id = sp.course_id
       LEFT JOIN lessons l ON l.id = sp.last_lesson_id
      WHERE sp.user_id = $1
      ORDER BY sp.client_updated_at DESC`,
    [req.user!.id],
  );
  res.json({
    courses: rows.map((r) => ({
      courseId: r.course_id,
      title: r.title,
      icon: r.icon,
      percent: r.percent_complete,
      lastLessonId: r.last_lesson_id,
      lastLessonTitle: r.last_lesson_title,
      avgQuizPercent: r.avg_quiz_percent,
      updatedAt: r.client_updated_at,
    })),
  });
});
