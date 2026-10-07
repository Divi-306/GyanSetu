import type { Href } from 'expo-router';

/** Must match the backend catalog: backend/src/modules/navigator/navigator.service.ts */
export const NAV_ACTION_NAMES = [
  'GO_HOME',
  'GO_BACK',
  'OPEN_COURSES',
  'OPEN_COURSE',
  'OPEN_LESSON',
  'START_NEXT_LESSON',
  'CONTINUE_LEARNING',
  'SHOW_PROGRESS',
  'LEARN_SUBJECT',
  'OPEN_LEARNING_PACKS',
  'OPEN_CAREER',
  'OPEN_STORAGE',
  'OPEN_REMINDERS',
  'OPEN_QUIZ',
  'OPEN_PROFILE',
  'EDIT_PROFILE',
  'OPEN_SETTINGS',
  'OPEN_AI_TUTOR',
  'OPEN_SCHOLARSHIPS',
  'OPEN_OFFLINE_HUB',
  'OPEN_LOGIN',
  'SEARCH',
  'SELECT_ITEM',
  'UNSUPPORTED',
  'UNKNOWN',
] as const;

export type NavActionName = (typeof NAV_ACTION_NAMES)[number];

/** One structured step: an action name plus plain words — never a route. */
export type NavIntent = {
  action: NavActionName;
  target: string | null;
  query: string | null;
  index: number | null;
  lessonNumber: number | null;
};

/** Something listed on the current screen, so "open the first one" works. */
export type ScreenItem = { title: string; href: Href };

export type NavContext = {
  route: string;
  screenItems: ScreenItem[];
  /** Learning pack shown on the current screen. */
  currentPackId: string | null;
  authed: boolean;
};

export type SearchResult = { id: string; title: string; subtitle: string; href: Href };

export type NavOutcome = {
  message: string;
  /** True if the app moved to another screen. */
  navigated: boolean;
  /** False stops a multi-step command (the step failed or needs the student). */
  ok: boolean;
  /** Pack the step ended on, so a following step like "start the next lesson" uses it. */
  packId?: string | null;
  results?: SearchResult[];
};
