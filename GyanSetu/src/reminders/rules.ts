/**
 * Learning reminders: when to send one and what it says. Pure functions (no React
 * Native imports) so they can be tested and reasoned about.
 *
 * Not spammy by construction: at most one reminder is ever scheduled; it fires only
 * after `frequencyDays` without studying (counted from the last study session AND the
 * last reminder), never inside quiet hours, and studying pushes it back.
 */

export type ReminderPrefs = {
  enabled: boolean;
  frequencyDays: 1 | 2 | 3 | 7;
  quietStartHour: number; // 22 → 10 PM
  quietEndHour: number; //   8 → 8 AM
};

export const DEFAULT_PREFS: ReminderPrefs = { enabled: false, frequencyDays: 3, quietStartHour: 22, quietEndHour: 8 };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function inQuietHours(d: Date, p: Pick<ReminderPrefs, 'quietStartHour' | 'quietEndHour'>): boolean {
  const h = d.getHours();
  return p.quietStartHour > p.quietEndHour ? h >= p.quietStartHour || h < p.quietEndHour : h >= p.quietStartHour && h < p.quietEndHour;
}

/** When the next reminder may fire, or null when reminders are off. */
export function nextReminderAt(input: { lastStudyAt: Date | null; lastReminderAt: Date | null; now: Date; prefs: ReminderPrefs }): Date | null {
  const { prefs, now } = input;
  if (!prefs.enabled) return null;
  const gap = prefs.frequencyDays * DAY;
  let at = Math.max(
    (input.lastStudyAt ?? now).getTime() + gap,
    input.lastReminderAt ? input.lastReminderAt.getTime() + gap : 0,
    now.getTime() + HOUR, // never "right now"
  );
  // Out of quiet hours: move to 30 minutes after they end.
  const d = new Date(at);
  if (inQuietHours(d, prefs)) {
    const end = new Date(d);
    end.setHours(prefs.quietEndHour, 30, 0, 0);
    if (end.getTime() <= d.getTime()) end.setDate(end.getDate() + 1);
    at = end.getTime();
  }
  return new Date(at);
}

export type ReminderContext = {
  packTitle: string | null;
  nextTopicTitle: string | null;
  /** Duration-based packs only. */
  dayNumber: number | null;
  durationDays: number | null;
  lastCompletedDay: { number: number; title: string } | null;
  nextDay: { number: number; title: string } | null;
  percent: number;
  dailyMinutes: number | null;
  weakTopic: string | null;
  daysInactive: number;
};

/** Friendly, specific copy. Never guilt: missing days is normal. */
export function buildReminder(c: ReminderContext): { title: string; body: string } {
  const title =
    c.daysInactive >= 2 ? `It's been ${c.daysInactive} days — ready for a quick session?` : 'Ready for a quick study session?';
  if (!c.packTitle) return { title, body: 'Pick a subject and learn something new in 15 minutes.' };
  if (c.weakTopic && c.daysInactive <= 7) {
    return { title, body: `You found ${c.weakTopic} tricky in your last quiz. Want to practise 5 questions?` };
  }
  if (c.lastCompletedDay && c.nextDay) {
    return {
      title,
      body: `You completed ${c.packTitle} Day ${c.lastCompletedDay.number}. Continue with Day ${c.nextDay.number}: ${c.nextDay.title}.`,
    };
  }
  if (c.durationDays && c.percent > 0) {
    return {
      title,
      body: `You're ${c.percent}% through your ${c.durationDays}-day ${c.packTitle} plan. A ${c.dailyMinutes ?? 25}-minute session today will keep you on track.`,
    };
  }
  return { title, body: c.nextTopicTitle ? `Your ${c.packTitle} lesson “${c.nextTopicTitle}” is waiting.` : `Your ${c.packTitle} pack is waiting.` };
}
