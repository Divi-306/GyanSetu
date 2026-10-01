import { router, type Href } from 'expo-router';
import { db } from '@/db';
import { getContinueLearning, listLessons } from '@/services/learning';
import { resolveCourse, searchLocal, type KnownCourse } from './resolve';
import type { NavActionName, NavContext, NavIntent, NavOutcome } from './types';

type ActionDef = {
  description: string;
  /** Needs a logged-in student. The backend still enforces access to protected data. */
  requiresAuth?: boolean;
  /** Validates the intent against real app data, then performs it. */
  run: (intent: NavIntent, ctx: NavContext) => Promise<NavOutcome>;
};

// ── Small helpers ─────────────────────────────────────

const go = (href: Href, message: string, courseId: string | null = null): NavOutcome => {
  router.push(href);
  return { message, navigated: true, ok: true, courseId };
};

const fail = (message: string): NavOutcome => ({ message, navigated: false, ok: false });

const titleOf = async (courseId: string) =>
  (await db.getFirstAsync<{ title: string }>('SELECT title FROM courses WHERE id = ?', courseId))?.title ?? courseId;

/**
 * The course a step is about: the one the student named, or (if they named
 * none) the course on screen. `named` is true when they said a name we
 * couldn't match — we then refuse instead of guessing.
 */
async function courseFor(intent: NavIntent, ctx: NavContext): Promise<{ course: KnownCourse | null; unmatched: string | null }> {
  if (intent.target?.trim()) {
    const course = await resolveCourse(intent.target);
    return { course, unmatched: course ? null : intent.target.trim() };
  }
  if (ctx.currentCourseId) return { course: { id: ctx.currentCourseId, title: await titleOf(ctx.currentCourseId) }, unmatched: null };
  return { course: null, unmatched: null };
}

const notFoundCourse = (name: string) => fail(`Sorry, I couldn't find a "${name}" course.`);

// ── The registry ──────────────────────────────────────

export const registry: Record<NavActionName, ActionDef> = {
  GO_HOME: {
    description: 'Open the dashboard',
    run: async () => go('/dashboard', 'Opening your dashboard.'),
  },

  GO_BACK: {
    description: 'Go back to the previous screen',
    run: async () => {
      if (!router.canGoBack()) return fail("There's no previous screen to go back to.");
      router.back();
      return { message: 'Going back.', navigated: true, ok: true };
    },
  },

  OPEN_COURSES: {
    description: 'Open the course list',
    run: async () => go('/courses', 'Opening your courses.'),
  },

  OPEN_COURSE: {
    description: 'Open a specific course',
    run: async (intent, ctx) => {
      const { course, unmatched } = await courseFor(intent, ctx);
      if (unmatched) return notFoundCourse(unmatched);
      if (!course) return fail('Which course? For example: "open my DSA course".');
      return go(`/course/${course.id}`, `Opening ${course.title}.`, course.id);
    },
  },

  OPEN_LESSON: {
    description: 'Open a lesson by number or title',
    run: async (intent, ctx) => {
      const { course, unmatched } = await courseFor(intent, ctx);
      if (unmatched) return notFoundCourse(unmatched);
      if (!course) return fail('Which course is that lesson in? For example: "open lesson 2 of Python".');
      const lessons = await listLessons(course.id);
      let lesson = intent.lessonNumber ? lessons.find((l) => l.position === intent.lessonNumber) : undefined;
      if (!lesson && intent.query) {
        const q = intent.query.toLowerCase();
        lesson = lessons.find((l) => l.title.toLowerCase().includes(q));
      }
      if (!lesson) {
        const what = intent.lessonNumber ? `Lesson ${intent.lessonNumber}` : `"${intent.query ?? 'That lesson'}"`;
        return fail(
          lessons.length === 0
            ? `${course.title} isn't downloaded yet. Open the course and tap Download.`
            : `${what} of ${course.title} isn't on your phone.`,
        );
      }
      return go(`/lesson/${lesson.id}`, `Opening Lesson ${lesson.position}: ${lesson.title}.`, course.id);
    },
  },

  START_NEXT_LESSON: {
    description: 'Start the next lesson not yet completed',
    run: async (intent, ctx) => {
      let { course, unmatched } = await courseFor(intent, ctx);
      if (unmatched) return notFoundCourse(unmatched);
      if (!course) {
        const resume = await getContinueLearning();
        if (!resume) return go('/starter-bundle', "You haven't started a course yet — here's the Starter Bundle.");
        course = { id: resume.courseId, title: resume.title };
      }
      const lessons = await listLessons(course.id);
      if (lessons.length === 0) {
        return go(`/course/${course.id}`, `${course.title} isn't on your phone yet — opening it so you can download it.`, course.id);
      }
      const next = lessons.find((l) => !l.completed);
      if (!next) return go(`/course/${course.id}`, `You've finished every downloaded lesson of ${course.title}! 🎉`, course.id);
      return go(`/lesson/${next.id}`, `Starting Lesson ${next.position}: ${next.title}.`, course.id);
    },
  },

  CONTINUE_LEARNING: {
    description: 'Resume where the student left off',
    run: async () => {
      const resume = await getContinueLearning();
      if (!resume) return go('/starter-bundle', "You haven't started anything yet — here's the Starter Bundle.");
      if (resume.lastLessonId) {
        const exists = await db.getFirstAsync('SELECT 1 FROM lessons WHERE id = ?', resume.lastLessonId);
        if (exists) return go(`/lesson/${resume.lastLessonId}`, `Continuing ${resume.title}.`, resume.courseId);
      }
      return go(`/course/${resume.courseId}`, `Opening ${resume.title}.`, resume.courseId);
    },
  },

  SHOW_PROGRESS: {
    description: 'Show progress overall or for a course',
    run: async (intent, ctx) => {
      // Overall progress only when no course is named; "my progress" on a course screen means that course.
      const { course, unmatched } = await courseFor(intent, ctx);
      if (unmatched) return notFoundCourse(unmatched);
      if (course) return go(`/course/${course.id}`, `Here's your progress in ${course.title}.`, course.id);
      return go('/profile', "Here's your overall progress.");
    },
  },

  OPEN_QUIZ: {
    description: 'Practise with a quiz',
    run: async (intent, ctx) => {
      const { course, unmatched } = await courseFor(intent, ctx);
      if (unmatched) return notFoundCourse(unmatched);
      if (!course) return go('/quizzes', 'Opening your quizzes.');
      const quiz = await db.getFirstAsync<{ id: string; title: string }>(
        `SELECT q.id, q.title FROM quizzes q WHERE q.course_id = ?
           AND EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.quiz_id = q.id) ORDER BY q.title LIMIT 1`,
        course.id,
      );
      if (!quiz) return fail(`There's no ${course.title} quiz on your phone yet. Download the course to get its quizzes.`);
      return go(`/quiz/${quiz.id}`, `Starting ${quiz.title}.`, course.id);
    },
  },

  OPEN_PROFILE: {
    description: 'Open the profile',
    run: async () => go('/profile', 'Opening your profile.'),
  },

  EDIT_PROFILE: {
    description: 'Edit profile details',
    requiresAuth: true,
    run: async () => go('/profile/edit', 'Opening your profile details.'),
  },

  OPEN_SETTINGS: {
    description: 'Settings live in the profile',
    run: async () => go('/profile', 'Your settings (language, sync, logout) are in your profile.'),
  },

  OPEN_STARTER_BUNDLE: {
    description: 'Open the Starter Bundle',
    run: async () => go('/starter-bundle', 'Opening the Starter Bundle.'),
  },

  OPEN_AI_TUTOR: {
    description: 'Ask the AI tutor',
    run: async (intent) =>
      intent.query?.trim()
        ? go({ pathname: '/ai', params: { q: intent.query.trim() } }, 'Asking the AI tutor…')
        : go('/ai', 'Opening the AI tutor.'),
  },

  OPEN_SCHOLARSHIPS: {
    description: 'Open scholarships',
    run: async () => go('/scholarships', 'Opening scholarships.'),
  },

  OPEN_OFFLINE_HUB: {
    description: 'Open the offline learning hub',
    run: async () => go('/offline', 'Opening offline learning.'),
  },

  OPEN_LOGIN: {
    description: 'Log in or sign up',
    run: async (_i, ctx) => (ctx.authed ? fail("You're already logged in.") : go('/login', 'Opening login.')),
  },

  SEARCH: {
    description: 'Search courses and downloaded lessons',
    run: async (intent) => {
      const query = intent.query?.trim() || intent.target?.trim();
      if (!query) return fail('What should I search for?');
      const results = await searchLocal(query);
      if (results.length === 0) return fail(`I couldn't find anything about "${query}" on your phone.`);
      return { message: `Here's what I found for "${query}":`, navigated: false, ok: true, results };
    },
  },

  SELECT_ITEM: {
    description: 'Open an item on the current screen by position',
    run: async (intent, ctx) => {
      // -1 means "the last one" (offline parser); the AI only sends 1-based positions.
      const n = intent.index === -1 ? ctx.screenItems.length : (intent.index ?? 0);
      if (ctx.screenItems.length === 0) return fail("There's no list on this screen to pick from.");
      const item = ctx.screenItems[n - 1];
      if (!item) return fail(`This screen only has ${ctx.screenItems.length} item${ctx.screenItems.length === 1 ? '' : 's'}.`);
      return go(item.href, `Opening ${item.title}.`);
    },
  },

  UNSUPPORTED: {
    description: 'A feature the app does not have',
    run: async (intent) => {
      const what = (intent.target ?? 'that').trim();
      const hint = /assign|homework|test|exam|task/i.test(what)
        ? ' You can practise with quizzes — say "open my quizzes".'
        : /notif|alert|message/i.test(what)
          ? ' Your sync status is in your profile.'
          : '';
      return fail(`GyanSetu doesn't have ${what} yet.${hint}`);
    },
  },

  UNKNOWN: {
    description: 'Not understood',
    run: async () => fail('Sorry, I didn\'t understand that. Try "open my courses" or "start my next lesson".'),
  },
};
