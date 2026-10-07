import { z } from 'zod';

const Iso = z.iso.datetime({ offset: true });
const base = { id: z.uuid(), createdAt: Iso };
// Learning-pack topic ids are slugs ("tcp-handshake"), stable across pack versions.
const TopicId = z.string().regex(/^[\p{L}\p{M}\p{N}-]{1,80}$/u);

export const SyncItem = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('LESSON_COMPLETED'),
    payload: z.object({ lessonId: z.uuid(), completedAt: Iso }),
  }),
  z.object({
    ...base,
    type: z.literal('PROGRESS_UPDATED'),
    payload: z.object({
      courseId: z.string().regex(/^[a-z0-9-]+$/),
      percent: z.number().int().min(0).max(100),
      lastLessonId: z.uuid().nullable().optional(),
      updatedAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('QUIZ_ATTEMPT_CREATED'),
    payload: z.object({
      attemptId: z.uuid(),
      quizId: z.uuid(),
      answers: z
        .array(z.object({ questionId: z.uuid(), selectedIndex: z.number().int().min(0).max(10) }))
        .max(200),
      clientScore: z.number().int().min(0).max(200), // smallint column; also caps obvious tampering
      total: z.number().int().min(1).max(200),
      startedAt: Iso.nullable().optional(),
      submittedAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('NOTE_UPSERTED'),
    payload: z.object({
      noteId: z.uuid(),
      lessonId: z.uuid(),
      text: z.string().max(10_000),
      createdAt: Iso,
      updatedAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('NOTE_DELETED'),
    payload: z.object({ noteId: z.uuid(), deletedAt: Iso }),
  }),
  z.object({
    ...base,
    type: z.literal('STORAGE_EVENT'),
    payload: z.object({
      courseId: z.string().regex(/^[a-z0-9-]+$/).nullable(),
      packVersion: z.number().int().nullable(),
      eventType: z.enum(['downloaded', 'archived', 'restored', 'cleanup_warned', 'kept', 'deleted']),
      occurredAt: Iso,
    }),
  }),

  // ── Dynamic learning packs ──
  z.object({
    ...base,
    type: z.literal('LP_LIBRARY_CHANGED'),
    payload: z.object({ packId: z.uuid(), version: z.number().int().min(1), state: z.enum(['active', 'deleted']), updatedAt: Iso }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_PROGRESS_UPDATED'),
    payload: z.object({
      packId: z.uuid(),
      percent: z.number().int().min(0).max(100),
      currentTopicId: TopicId.nullable(),
      updatedAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_TOPIC_UPDATED'),
    payload: z.object({
      packId: z.uuid(),
      topicId: TopicId,
      completedAt: Iso.nullable().optional(),
      bookmarked: z.boolean().optional(),
      timeSpentDeltaSec: z.number().int().min(0).max(86_400).optional(),
      updatedAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_ANSWER_RECORDED'),
    payload: z.object({
      answerId: z.uuid(),
      packId: z.uuid(),
      packVersion: z.number().int().min(1),
      topicId: TopicId,
      itemId: z.string().min(1).max(200),
      kind: z.enum(['mcq', 'viva', 'practice', 'flashcard']),
      correct: z.boolean(),
      score: z.number().min(0).max(1),
      answeredAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_CHAT_MESSAGE'),
    payload: z.object({
      messageId: z.uuid(),
      packId: z.uuid(),
      role: z.enum(['user', 'tutor']),
      text: z.string().min(1).max(20_000),
      meta: z
        .object({
          mode: z.enum(['online', 'offline']).optional(),
          quickReplies: z.array(z.string().max(200)).max(8).optional(),
          sources: z.array(z.string().max(300)).max(8).optional(),
          grounded: z.boolean().optional(),
        })
        .nullable(),
      createdAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_CHAT_CLEARED'),
    payload: z.object({ packId: z.uuid(), clearedAt: Iso }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_VIDEO_PROGRESS'),
    payload: z.object({
      packId: z.uuid(),
      videoId: z.string().min(1).max(200),
      positionSec: z.number().min(0).max(86_400),
      durationSec: z.number().min(0).max(86_400).nullable(),
      completedAt: Iso.nullable().optional(),
      updatedAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_STUDY_TIME'),
    // The student's local calendar date, so streaks match their days, not UTC.
    payload: z.object({ day: z.iso.date(), secondsDelta: z.number().int().min(1).max(86_400) }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_QUIZ_SAVED'),
    payload: z.object({
      quizId: z.uuid(),
      packId: z.uuid(),
      packVersion: z.number().int().min(1),
      subject: z.string().max(200),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      topicIds: z.array(TopicId).max(50),
      questions: z
        .array(
          z.object({
            id: z.string().min(1).max(200),
            topicId: TopicId,
            question: z.string().min(1).max(2000),
            options: z.array(z.string().max(500)).min(2).max(6),
            correctIndex: z.number().int().min(0).max(5),
            explanation: z.string().max(2000),
            difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
          }),
        )
        .min(1)
        .max(50),
      source: z.enum(['online', 'offline']),
      createdAt: Iso,
    }),
  }),
  z.object({
    ...base,
    type: z.literal('LP_QUIZ_ATTEMPT'),
    payload: z.object({
      attemptId: z.uuid(),
      quizId: z.uuid(),
      packId: z.uuid(),
      answers: z.array(z.object({ questionId: z.string().min(1).max(200), selectedIndex: z.number().int().min(0).max(10) })).max(50),
      score: z.number().int().min(0).max(50),
      total: z.number().int().min(1).max(50),
      correctCount: z.number().int().min(0).max(50),
      wrongCount: z.number().int().min(0).max(50),
      weakTopicIds: z.array(TopicId).max(50),
      timeTakenSec: z.number().int().min(0).max(86_400),
      startedAt: Iso.nullable().optional(),
      submittedAt: Iso,
    }),
  }),
]);

export type SyncItem = z.infer<typeof SyncItem>;

export const SyncBatchBody = z.object({
  deviceId: z.string().min(1).max(100),
  items: z.array(z.unknown()).min(1).max(200),
});

export type SyncResult = {
  id: string | null;
  status: 'applied' | 'duplicate' | 'rejected' | 'error';
  code?: string;
  message?: string;
};
