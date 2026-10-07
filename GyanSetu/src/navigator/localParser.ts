import { findPackInText } from './resolve';
import type { NavActionName, NavIntent } from './types';

/**
 * Offline fallback only. The AI model is the primary way commands are
 * understood; this runs when the phone is offline or the AI is unavailable,
 * and covers common phrasings in English and some Hindi/Hinglish. It outputs
 * the same structured intents, which the registry still validates.
 */

const intent = (action: NavActionName, extra: Partial<NavIntent> = {}): NavIntent => ({
  action, target: null, query: null, index: null, lessonNumber: null, ...extra,
});

const ORDINALS: Record<string, number> = {
  first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5,
  last: -1, 'पहला': 1, 'पहले': 1, 'दूसरा': 2, 'तीसरा': 3,
};

const has = (t: string, re: RegExp) => re.test(t);

export async function parseLocally(text: string): Promise<NavIntent[]> {
  const t = text.toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [intent('UNKNOWN')];

  // Things the app doesn't have — answer honestly rather than navigating somewhere random.
  const unsupported = /\b(assignments?|homework|messages?|inbox|certificates?)\b/.exec(t);
  if (unsupported) return [intent('UNSUPPORTED', { target: unsupported[1] })];

  // Note: \b only works for Latin letters, so Hindi words sit outside the \b(...) groups.
  if (has(t, /\b(go back|back|previous( screen| page)?|peeche)\b|वापस/)) return [intent('GO_BACK')];
  if (has(t, /\b(home|dashboard|main screen)\b|होम/)) return [intent('GO_HOME')];

  const pack = await findPackInText(t);
  const target = pack?.id ?? null;

  // "Teach me X" / "I want to learn X (in 15 days)" for anything that isn't an existing pack → a new learning pack.
  // Checked before the feature words below, so "teach me space science" isn't taken as "storage".
  const learn = /\b(?:teach me|i want to learn|i'?d like to learn|learn|make a (?:learning )?pack for)\s+(?:about\s+)?(.+)/.exec(t);
  if (learn && !pack && !has(t, /\b(find|search|lessons? (about|on))\b/)) return [intent('LEARN_SUBJECT', { target: learn[1] })];

  if (has(t, /\b(learning packs?|my packs?|downloaded packs?)\b/)) return [intent('OPEN_LEARNING_PACKS')];
  if (has(t, /\b(career|roadmap|which job)\b/)) return [intent('OPEN_CAREER')];
  if (has(t, /\b(storage|free up space|phone space|compress (my )?packs?)\b/)) return [intent('OPEN_STORAGE')];
  if (has(t, /\b(reminders?|notifications?|remind me)\b/)) return [intent('OPEN_REMINDERS')];

  if (has(t, /\bnext lesson\b|\bstart (my )?(next|the next)\b|agla (lesson|path)|अगला/)) return [intent('START_NEXT_LESSON', { target })];
  if (has(t, /\b(continue|resume|left off|where i was|current lesson)\b|जारी/)) return [intent('CONTINUE_LEARNING')];

  const lessonNo = /\blesson (\d+)\b|\b(\d+)(st|nd|rd|th)? lesson\b/.exec(t);
  if (lessonNo) return [intent('OPEN_LESSON', { target, lessonNumber: Number(lessonNo[1] ?? lessonNo[2]) })];

  if (has(t, /\b(progress|how (am i|much have i) (doing|done)|my stats)\b|प्रगति/)) return [intent('SHOW_PROGRESS', { target })];
  if (has(t, /\b(quiz|quizzes|practi[cs]e|test (myself|me)|mcq)\b|अभ्यास/)) return [intent('OPEN_QUIZ', { target })];
  if (has(t, /\bedit (my )?(profile|details)\b|\bupdate (my )?(profile|details)\b/)) return [intent('EDIT_PROFILE')];
  if (has(t, /\b(settings?|preferences?|language|logout|log out|sign out)\b/)) return [intent('OPEN_SETTINGS')];
  if (has(t, /\b(profile|account)\b|प्रोफ़ाइल|प्रोफाइल/)) return [intent('OPEN_PROFILE')];
  if (has(t, /\bscholarships?\b|छात्रवृत्ति/)) return [intent('OPEN_SCHOLARSHIPS')];
  if (has(t, /\b(offline|downloaded|downloads|sync)\b/)) return [intent('OPEN_OFFLINE_HUB')];
  if (has(t, /\b(log ?in|sign ?(in|up)|create (an )?account|register)\b/)) return [intent('OPEN_LOGIN')];

  const ask = /\b(?:ask|explain|what is|what are|how does|why does|doubt)\b\s*(.*)/.exec(t);
  if (ask && !pack) return [intent('OPEN_AI_TUTOR', { query: text.trim() })];

  const ordinal = /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\b|(पहला|पहले|दूसरा|तीसरा)/.exec(t);
  if (ordinal && has(t, /\b(open|one|item|it|course|lesson|that|this)\b|खोलो/)) {
    return [intent('SELECT_ITEM', { index: ORDINALS[ordinal[1] ?? ordinal[2]] })];
  }

  if (pack) {
    if (has(t, /\b(find|search)\b/)) return [intent('SEARCH', { query: pack.title })];
    return [intent('OPEN_COURSE', { target })];
  }

  const search = /\b(?:find|search(?: for)?|look for|lessons? (?:about|on)|study)\s+(.+)/.exec(t);
  if (search) return [intent('SEARCH', { query: search[1].replace(/^(my|the|a|an) /, '') })];

  if (has(t, /\b(courses?|learning|subjects?|what i'?m learning|course section|कोर्स)\b/)) return [intent('OPEN_COURSES')];

  return [intent('UNKNOWN')];
}
