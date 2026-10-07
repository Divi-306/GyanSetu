import { router, type Href } from 'expo-router';
import { db } from '@/db';
import { getPackDetail, listMyPacks } from '@/services/learningPacks';
import { resolvePack, searchLocal, type KnownPack } from './resolve';
import type { NavActionName, NavContext, NavIntent, NavOutcome } from './types';

type ActionDef = {
  description: string;
  /** Needs a logged-in student. The backend still enforces access to protected data. */
  requiresAuth?: boolean;
  /** Validates the intent against real app data, then performs it. */
  run: (intent: NavIntent, ctx: NavContext) => Promise<NavOutcome>;
};

// ── Small helpers ─────────────────────────────────────

const go = (href: Href, message: string, packId: string | null = null): NavOutcome => {
  router.push(href);
  return { message, navigated: true, ok: true, packId };
};

const fail = (message: string): NavOutcome => ({ message, navigated: false, ok: false });

const titleOf = async (packId: string) =>
  (await db.getFirstAsync<{ title: string }>('SELECT title FROM lp_packs WHERE pack_id = ?', packId))?.title ?? packId;

/**
 * The pack a step is about: the one the student named, or (if they named
 * none) the pack on screen. `named` is true when they said a name we
 * couldn't match — we then refuse instead of guessing.
 */
async function packFor(intent: NavIntent, ctx: NavContext): Promise<{ pack: KnownPack | null; unmatched: string | null }> {
  if (intent.target?.trim()) {
    const pack = await resolvePack(intent.target);
    return { pack, unmatched: pack ? null : intent.target.trim() };
  }
  if (ctx.currentPackId) return { pack: { id: ctx.currentPackId, title: await titleOf(ctx.currentPackId) }, unmatched: null };
  return { pack: null, unmatched: null };
}

const notFoundPack = (name: string) => fail(`Sorry, I couldn't find a "${name}" learning pack.`);

/** The pack the student most recently studied, if any. */
async function mostRecentPack(): Promise<KnownPack | null> {
  const packs = await listMyPacks();
  const onDevice = packs.filter((p) => p.onDevice);
  if (onDevice.length === 0) return null;
  return { id: onDevice[0].packId, title: onDevice[0].title };
}

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
    description: 'Open my learning packs',
    run: async () => go('/packs', 'Opening your learning packs.'),
  },

  OPEN_COURSE: {
    description: 'Open a specific learning pack',
    run: async (intent, ctx) => {
      const { pack, unmatched } = await packFor(intent, ctx);
      if (unmatched) return notFoundPack(unmatched);
      if (!pack) return fail('Which learning pack? For example: "open my DSA pack".');
      return go(`/packs/${pack.id}`, `Opening ${pack.title}.`, pack.id);
    },
  },

  OPEN_LESSON: {
    description: 'Open a topic by number or title',
    run: async (intent, ctx) => {
      const { pack, unmatched } = await packFor(intent, ctx);
      if (unmatched) return notFoundPack(unmatched);
      if (!pack) return fail('Which pack is that topic in? For example: "open topic 2 of Python".');
      const topics = await db.getAllAsync<{ id: string; title: string; position: number }>(
        'SELECT id, title, position FROM lp_topics WHERE pack_id = ? ORDER BY position',
        pack.id,
      );
      let topic = intent.lessonNumber ? topics.find((t) => t.position === intent.lessonNumber) : undefined;
      if (!topic && intent.query) {
        const q = intent.query.toLowerCase();
        topic = topics.find((t) => t.title.toLowerCase().includes(q));
      }
      if (!topic) {
        const what = intent.lessonNumber ? `Topic ${intent.lessonNumber}` : `"${intent.query ?? 'That topic'}"`;
        return fail(
          topics.length === 0
            ? `${pack.title} isn't downloaded yet. Open the pack and tap Download.`
            : `${what} of ${pack.title} isn't on your phone.`,
        );
      }
      return go(`/packs/${pack.id}/topic/${topic.id}`, `Opening: ${topic.title}.`, pack.id);
    },
  },

  START_NEXT_LESSON: {
    description: 'Start the next topic not yet completed',
    run: async (intent, ctx) => {
      let { pack, unmatched } = await packFor(intent, ctx);
      if (unmatched) return notFoundPack(unmatched);
      if (!pack) {
        const recent = await mostRecentPack();
        if (!recent) return go('/learn', "You haven't started a learning pack yet — let's create one.");
        pack = recent;
      }
      const detail = await getPackDetail(pack.id);
      if (!detail) return go(`/packs/${pack.id}`, `${pack.title} isn't on your phone yet — opening it so you can download it.`, pack.id);
      if (!detail.resumeTopicId) return go(`/packs/${pack.id}`, `You've finished every downloaded topic of ${pack.title}! 🎉`, pack.id);
      const topic = detail.modules.flatMap((m) => m.topics).find((t) => t.id === detail.resumeTopicId);
      return go(`/packs/${pack.id}/topic/${detail.resumeTopicId}`, `Starting: ${topic?.title ?? 'the next topic'}.`, pack.id);
    },
  },

  CONTINUE_LEARNING: {
    description: 'Resume where the student left off',
    run: async () => {
      const recent = await mostRecentPack();
      if (!recent) return go('/learn', "You haven't started anything yet — let's create a learning pack.");
      const detail = await getPackDetail(recent.id);
      if (detail?.resumeTopicId) return go(`/packs/${recent.id}/topic/${detail.resumeTopicId}`, `Continuing ${recent.title}.`, recent.id);
      return go(`/packs/${recent.id}`, `Opening ${recent.title}.`, recent.id);
    },
  },

  SHOW_PROGRESS: {
    description: 'Show progress overall or for a pack',
    run: async (intent, ctx) => {
      // Overall progress only when no pack is named; "my progress" on a pack screen means that pack.
      const { pack, unmatched } = await packFor(intent, ctx);
      if (unmatched) return notFoundPack(unmatched);
      if (pack) return go(`/packs/${pack.id}`, `Here's your progress in ${pack.title}.`, pack.id);
      return go('/progress', "Here's your overall progress.");
    },
  },

  LEARN_SUBJECT: {
    description: 'Create a learning pack for any subject',
    run: async (intent) => {
      const said = (intent.target ?? intent.query ?? '').trim();
      // "Python in 15 days" → subject "Python", 15 days. The Learn screen still lets them change it.
      const days = /\b(?:in|for)\s+(\d{1,3})\s*days?\b/i.exec(said);
      const subject = said
        .replace(/\b(?:in|for)\s+\d{1,3}\s*days?\b/i, '')
        .replace(/^(please\s+)?(teach me|i want to learn|i'?d like to learn|learn|make a pack for|study)\s+(about\s+)?/i, '')
        .trim();
      return go(
        { pathname: '/learn', params: { ...(subject ? { subject } : {}), ...(days ? { days: days[1] } : {}) } },
        subject ? `Let's build a learning pack for ${subject}.` : 'What would you like to learn?',
      );
    },
  },

  OPEN_LEARNING_PACKS: {
    description: 'Open my learning packs',
    run: async () => go('/packs', 'Opening your learning packs.'),
  },

  OPEN_CAREER: {
    description: 'Career guidance and roadmap',
    run: async () => go('/career', 'Opening career guidance.'),
  },

  OPEN_STORAGE: {
    description: 'Offline storage',
    run: async () => go('/storage', 'Opening offline storage.'),
  },

  OPEN_REMINDERS: {
    description: 'Learning reminder settings',
    run: async () => go('/settings/reminders', 'Opening learning reminders.'),
  },

  OPEN_QUIZ: {
    description: 'Practise with a quiz',
    run: async (intent, ctx) => {
      const { pack, unmatched } = await packFor(intent, ctx);
      if (unmatched) return notFoundPack(unmatched);
      if (!pack) return go('/packs', 'Open a learning pack, then say "quiz me" to test yourself on it.');
      return go(`/packs/${pack.id}/quiz`, `Opening quizzes for ${pack.title}.`, pack.id);
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
    description: 'Search learning packs and downloaded topics',
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
      const hint = /assign|homework|test|exam|task/i.test(what) ? ' You can practise with quizzes — say "open my quizzes".' : '';
      return fail(`GyanSetu doesn't have ${what} yet.${hint}`);
    },
  },

  UNKNOWN: {
    description: 'Not understood',
    run: async () => fail('Sorry, I didn\'t understand that. Try "teach me Python in 15 days" or "continue where I left off".'),
  },
};
