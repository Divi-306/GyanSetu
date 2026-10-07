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

    // Library membership: last write wins on the client's clock.
    case 'LP_LIBRARY_CHANGED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_library (user_id, pack_id, version, state, client_updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, pack_id) DO UPDATE SET
           version = EXCLUDED.version, state = EXCLUDED.state,
           client_updated_at = EXCLUDED.client_updated_at, received_at = now()
         WHERE pack_library.client_updated_at <= EXCLUDED.client_updated_at`,
        [userId, p.packId, p.version, p.state, p.updatedAt],
      );
      return;
    }

    // Same rules as course progress: percent never goes down, the newest position wins.
    case 'LP_PROGRESS_UPDATED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_progress (user_id, pack_id, percent, current_topic_id, client_updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, pack_id) DO UPDATE SET
           percent           = GREATEST(pack_progress.percent, EXCLUDED.percent),
           current_topic_id  = CASE WHEN EXCLUDED.client_updated_at >= pack_progress.client_updated_at
                                    THEN coalesce(EXCLUDED.current_topic_id, pack_progress.current_topic_id)
                                    ELSE pack_progress.current_topic_id END,
           client_updated_at = GREATEST(pack_progress.client_updated_at, EXCLUDED.client_updated_at),
           received_at       = now()`,
        [userId, p.packId, p.percent, p.currentTopicId, p.updatedAt],
      );
      return;
    }

    // Completion is monotonic (earliest wins), the bookmark is last-write-wins and time adds up.
    // Each time delta counts once because sync_events rejects a replayed item id.
    case 'LP_TOPIC_UPDATED': {
      const p = item.payload;
      const bookmarked = p.bookmarked ?? null;
      await db.query(
        `INSERT INTO pack_topic_progress (user_id, pack_id, topic_id, completed_at, bookmarked, bookmark_updated_at, time_spent_sec)
         VALUES ($1, $2, $3, $4, coalesce($5::boolean, false), CASE WHEN $5::boolean IS NULL THEN NULL ELSE $6::timestamptz END, $7)
         ON CONFLICT (user_id, pack_id, topic_id) DO UPDATE SET
           completed_at = CASE WHEN pack_topic_progress.completed_at IS NULL THEN EXCLUDED.completed_at
                               WHEN EXCLUDED.completed_at IS NULL THEN pack_topic_progress.completed_at
                               ELSE LEAST(pack_topic_progress.completed_at, EXCLUDED.completed_at) END,
           bookmarked = CASE WHEN $5::boolean IS NOT NULL AND (pack_topic_progress.bookmark_updated_at IS NULL
                                  OR pack_topic_progress.bookmark_updated_at <= $6::timestamptz)
                             THEN $5::boolean ELSE pack_topic_progress.bookmarked END,
           bookmark_updated_at = CASE WHEN $5::boolean IS NOT NULL AND (pack_topic_progress.bookmark_updated_at IS NULL
                                           OR pack_topic_progress.bookmark_updated_at <= $6::timestamptz)
                                      THEN $6::timestamptz ELSE pack_topic_progress.bookmark_updated_at END,
           time_spent_sec = pack_topic_progress.time_spent_sec + EXCLUDED.time_spent_sec,
           received_at = now()`,
        [userId, p.packId, p.topicId, p.completedAt ?? null, bookmarked, p.updatedAt, p.timeSpentDeltaSec ?? 0],
      );
      return;
    }

    case 'LP_ANSWER_RECORDED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_answers (id, user_id, pack_id, pack_version, topic_id, item_id, kind, correct, score, answered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [p.answerId, userId, p.packId, p.packVersion, p.topicId, p.itemId, p.kind, p.correct, p.score, p.answeredAt],
      );
      return;
    }

    // Append-only. A message from before the latest "new conversation" (sent late by an
    // offline device) is dropped, so a clear can't be undone. Strictly before: a message
    // written in the same millisecond as the clear is the new conversation's first.
    case 'LP_CHAT_MESSAGE': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_chat_messages (id, user_id, pack_id, role, text, meta, created_at)
         SELECT $1, $2, $3, $4, $5, $6, $7
          WHERE NOT EXISTS (SELECT 1 FROM pack_chat_clears
                             WHERE user_id = $2 AND pack_id = $3 AND cleared_at > $7::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [p.messageId, userId, p.packId, p.role, p.text, p.meta ? JSON.stringify(p.meta) : null, p.createdAt],
      );
      return;
    }

    // Position: last write wins on client time. Completion: earliest wins, never undone.
    case 'LP_VIDEO_PROGRESS': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_video_progress (user_id, pack_id, video_id, position_sec, duration_sec, completed_at, client_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, pack_id, video_id) DO UPDATE SET
           position_sec = CASE WHEN EXCLUDED.client_updated_at >= pack_video_progress.client_updated_at
                               THEN EXCLUDED.position_sec ELSE pack_video_progress.position_sec END,
           duration_sec = coalesce(EXCLUDED.duration_sec, pack_video_progress.duration_sec),
           completed_at = CASE WHEN pack_video_progress.completed_at IS NULL THEN EXCLUDED.completed_at
                               WHEN EXCLUDED.completed_at IS NULL THEN pack_video_progress.completed_at
                               ELSE LEAST(pack_video_progress.completed_at, EXCLUDED.completed_at) END,
           client_updated_at = GREATEST(pack_video_progress.client_updated_at, EXCLUDED.client_updated_at),
           received_at = now()`,
        [userId, p.packId, p.videoId, p.positionSec, p.durationSec, p.completedAt ?? null, p.updatedAt],
      );
      return;
    }

    // Additive; each delta counts once because sync_events rejects a replayed item id.
    case 'LP_STUDY_TIME': {
      const p = item.payload;
      await db.query(
        `INSERT INTO study_days (user_id, day, seconds) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, day) DO UPDATE SET seconds = study_days.seconds + EXCLUDED.seconds, received_at = now()`,
        [userId, p.day, p.secondsDelta],
      );
      return;
    }

    // Append-only: a saved quiz never changes after creation.
    case 'LP_QUIZ_SAVED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_quizzes (id, user_id, pack_id, pack_version, subject, difficulty, topic_ids, questions, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [p.quizId, userId, p.packId, p.packVersion, p.subject, p.difficulty, JSON.stringify(p.topicIds), JSON.stringify(p.questions), p.source, p.createdAt],
      );
      return;
    }

    // Append-only, like LP_ANSWER_RECORDED, but at quiz-attempt granularity.
    case 'LP_QUIZ_ATTEMPT': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_quiz_attempts
           (id, user_id, quiz_id, pack_id, answers, score, total, correct_count, wrong_count, weak_topic_ids, time_taken_sec, started_at, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
        [
          p.attemptId, userId, p.quizId, p.packId, JSON.stringify(p.answers), p.score, p.total, p.correctCount, p.wrongCount,
          JSON.stringify(p.weakTopicIds), p.timeTakenSec, p.startedAt ?? null, p.submittedAt,
        ],
      );
      return;
    }

    case 'LP_CHAT_CLEARED': {
      const p = item.payload;
      await db.query(
        `INSERT INTO pack_chat_clears (user_id, pack_id, cleared_at) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, pack_id) DO UPDATE SET
           cleared_at = GREATEST(pack_chat_clears.cleared_at, EXCLUDED.cleared_at), received_at = now()`,
        [userId, p.packId, p.clearedAt],
      );
      await db.query(
        'DELETE FROM pack_chat_messages WHERE user_id = $1 AND pack_id = $2 AND created_at < $3',
        [userId, p.packId, p.clearedAt],
      );
      return;
    }
  }
}
