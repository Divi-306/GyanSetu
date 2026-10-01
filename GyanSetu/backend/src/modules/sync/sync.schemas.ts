import { z } from 'zod';

const Iso = z.iso.datetime({ offset: true });
const base = { id: z.uuid(), createdAt: Iso };

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
