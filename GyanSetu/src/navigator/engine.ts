import { api, ApiError, NetworkError } from '@/lib/api';
import { selectOnline, useApp } from '@/stores/appStore';
import { parseLocally } from './localParser';
import { registry } from './registry';
import { listKnownCourses } from './resolve';
import { NAV_ACTION_NAMES, type NavContext, type NavIntent, type NavOutcome } from './types';

/**
 * The Navigator engine. Any input source — the text box today, speech later —
 * calls runCommand() with plain text:
 *
 *   text → understand (AI, or offline parser) → intents → validate → execute
 */

export type CommandResult = NavOutcome & {
  /** How the command was understood: by the AI, or by the offline fallback. */
  understoodBy: 'ai' | 'offline';
};

const MAX_STEPS = 3;
const KNOWN = new Set<string>(NAV_ACTION_NAMES);

/** Ask the backend AI (provider-agnostic; the key never leaves the server). */
async function understandOnline(text: string, ctx: NavContext): Promise<NavIntent[]> {
  const courses = await listKnownCourses();
  const current = ctx.currentCourseId ? courses.find((c) => c.id === ctx.currentCourseId) ?? null : null;
  const res = await api<{ actions: NavIntent[] }>('/v1/navigator/intent', {
    method: 'POST',
    timeoutMs: 15_000,
    body: {
      message: text,
      context: {
        route: ctx.route,
        courses: courses.slice(0, 60),
        screenItems: ctx.screenItems.slice(0, 30).map((i) => i.title.slice(0, 120)),
        currentCourse: current,
      },
    },
  });
  // Defence in depth: the server already validates, but never trust shape from the network.
  return res.actions.filter((a) => KNOWN.has(a.action)).slice(0, MAX_STEPS);
}

async function understand(text: string, ctx: NavContext): Promise<{ intents: NavIntent[]; by: 'ai' | 'offline' }> {
  if (selectOnline(useApp.getState())) {
    try {
      const intents = await understandOnline(text, ctx);
      if (intents.length) return { intents, by: 'ai' };
    } catch (err) {
      // Offline, AI not configured, rate-limited or down: fall back to the offline parser.
      if (!(err instanceof NetworkError) && !(err instanceof ApiError)) throw err;
    }
  }
  return { intents: await parseLocally(text), by: 'offline' };
}

export async function runCommand(text: string, ctx: NavContext): Promise<CommandResult> {
  const { intents, by } = await understand(text.trim(), ctx);

  let context = ctx;
  let last: NavOutcome = { message: '', navigated: false, ok: false };
  let anyNavigated = false;
  const messages: string[] = [];

  for (const intent of intents) {
    const def = registry[intent.action];
    if (def.requiresAuth && !context.authed) {
      last = { message: 'Please log in first — say "log in" or open your profile.', navigated: false, ok: false };
      messages.push(last.message);
      break;
    }
    last = await def.run(intent, context);
    messages.push(last.message);
    anyNavigated ||= last.navigated;
    if (!last.ok) break;
    // Later steps ("…and start the next lesson") act on the course this step opened.
    if (last.courseId) context = { ...context, currentCourseId: last.courseId };
  }

  // One confirmation for multi-step commands: the final step's message (or the failure).
  // navigated is true if any step moved screens, even if a later step then failed.
  return { ...last, navigated: anyNavigated, message: last.message || messages.join(' '), understoodBy: by };
}
