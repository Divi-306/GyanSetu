import type { PoolClient } from 'pg';
import type { SyncItem } from './sync.schemas';

export class SyncRejection extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function recomputeCourseProgress(db: PoolClient, userId: string, lessonId: string, at: string) {
  await db.query(
    `INSERT INTO student_progress (user_id, course_id, percent_complete, last_lesson_id, client_updated_at)
     SELECT $1, l.course_id,
            COALESCE(LEAST(100, ROUND(100.0 *
              (SELECT count(*) FROM lesson_completions lc JOIN lessons l2 ON l2.id = lc.lesson_id
                WHERE lc.user_id = $1 AND l2.course_id = l.course_id)
              / NULLIF((SELECT count(*) FROM lessons l3 WHERE l3.course_id = l.course_id), 0))), 0)::smallint,
            l.id, $3
       FROM lessons l WHERE l.id = $2
     ON CONFLICT (user_id, course_id) DO UPDATE SET
       percent_complete  = GREATEST(student_progress.percent_complete, EXCLUDED.percent_complete),
       last_lesson_id    = CASE WHEN EXCLUDED.client_updated_at >= student_progress.client_updated_at
                                THEN EXCLUDED.last_lesson_id ELSE student_progress.last_lesson_id END,
       client_updated_at = GREATEST(student_progress.client_updated_at, EXCLUDED.client_updated_at),
       updated_at        = now()`,
    [userId, lessonId, at],
  );
}

export async function applySyncItem(db: PoolClient, userId: string, item: SyncItem) {
  switch (item.type) {
    case 'LESSON_COMPLETED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO lesson_completions (user_id, lesson_id, completed_at)
         VALUES ($1, $2, $3) ON CONFLICT (user_id, lesson_id) DO NOTHING`,
        [userId, p.lessonId, p.completedAt],
      );
      await recomputeCourseProgress(db, userId, p.lessonId, p.completedAt);
      return;
    }

    case 'PROGRESS_UPDATED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO student_progress (user_id, course_id, percent_complete, last_lesson_id, client_updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, course_id) DO UPDATE SET
           percent_complete  = GREATEST(student_progress.percent_complete, EXCLUDED.percent_complete),
           last_lesson_id    = CASE WHEN EXCLUDED.client_updated_at >= student_progress.client_updated_at
                                    THEN COALESCE(EXCLUDED.last_lesson_id, student_progress.last_lesson_id)
                                    ELSE student_progress.last_lesson_id END,
           client_updated_at = GREATEST(student_progress.client_updated_at, EXCLUDED.client_updated_at),
           updated_at        = now()`,
        [userId, p.courseId, p.percent, p.lastLessonId ?? null, p.updatedAt],
      );
      return;
    }

    case 'QUIZ_ATTEMPT_CREATED': {
      const p = item.payload;
      const { rows } = await db.query<{ id: string; correct_index: number }>(
        'SELECT id, correct_index FROM quiz_questions WHERE quiz_id = $1',
        [p.quizId],
      );
      if (rows.length === 0) throw new SyncRejection('UNKNOWN_QUIZ', 'Quiz does not exist');
      const correct = new Map(rows.map((r) => [r.id, r.correct_index]));
      // One answer per question: the first one counts, so repeating a correct
      // answer can't push the score above the number of questions.
      const answered = new Map<string, number>();
      for (const a of p.answers) if (!answered.has(a.questionId)) answered.set(a.questionId, a.selectedIndex);
      const serverScore = [...answered].filter(([q, sel]) => correct.get(q) === sel).length;

      await db.query(
        `INSERT INTO quiz_attempts
           (id, user_id, quiz_id, answers, client_score, server_score, total, started_at, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.attemptId, userId, p.quizId, JSON.stringify(p.answers), p.clientScore, serverScore,
          rows.length, p.startedAt ?? null, p.submittedAt,
        ],
      );
      return;
    }

    case 'NOTE_UPSERTED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO notes (id, user_id, lesson_id, text, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           text = EXCLUDED.text, updated_at = EXCLUDED.updated_at, received_at = now()
         WHERE notes.user_id = EXCLUDED.user_id AND notes.updated_at < EXCLUDED.updated_at`,
        [p.noteId, userId, p.lessonId, p.text, p.createdAt, p.updatedAt],
      );
      return;
    }

    case 'NOTE_DELETED': {
      const p = item.payload;
      await db.query(
        `UPDATE notes SET deleted_at = $3, received_at = now()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [p.noteId, userId, p.deletedAt],
      );
      return;
    }

    case 'STORAGE_EVENT': {
      const p = item.payload;
      await db.query(
        `INSERT INTO storage_events (id, user_id, course_id, pack_version, event_type, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [item.id, userId, p.courseId, p.packVersion, p.eventType, p.occurredAt],
      );
      return;
    }
  }
}
