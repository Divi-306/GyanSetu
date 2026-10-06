import type { TopicState } from './types';

/** How many recent answers per topic count towards its accuracy. */
export const RECENT_ANSWERS = 6;
const WEAK_BELOW = 0.6;
const MIN_ATTEMPTS = 2;

/** Weak = answered at least twice and getting under 60% of the recent ones right. Evidence only, never guessed. */
export const isWeak = (s: TopicState | undefined) =>
  !!s && s.attempts >= MIN_ATTEMPTS && s.recentAccuracy !== null && s.recentAccuracy < WEAK_BELOW;

export const isStrong = (s: TopicState | undefined) =>
  !!s && s.attempts >= MIN_ATTEMPTS && s.recentAccuracy !== null && s.recentAccuracy >= 0.8;

export type ModuleStatus = 'done' | 'in_progress' | 'available' | 'locked';

export const MODULE_ICON: Record<ModuleStatus, string> = { done: '✅', in_progress: '🔄', available: '⭕', locked: '🔒' };

/**
 * done: every topic completed. in_progress: some work in it, or it holds the current topic.
 * locked: nothing started and the previous module isn't done yet (a suggestion of order —
 * students can still open it). available: the next module to start.
 */
export function moduleStatuses(
  modules: { id: string; topicIds: string[] }[],
  states: Map<string, TopicState>,
  currentTopicId: string | null,
): ModuleStatus[] {
  const out: ModuleStatus[] = [];
  modules.forEach((m, i) => {
    const done = m.topicIds.length > 0 && m.topicIds.every((id) => states.get(id)?.completed);
    const started = m.topicIds.some((id) => {
      const s = states.get(id);
      return id === currentTopicId || s?.completed || (s?.attempts ?? 0) > 0;
    });
    if (done) out.push('done');
    else if (started) out.push('in_progress');
    else if (i === 0 || out[i - 1] === 'done') out.push('available');
    else out.push('locked');
  });
  return out;
}

export function percentComplete(topicIds: string[], states: Map<string, TopicState>): number {
  if (topicIds.length === 0) return 0;
  const done = topicIds.filter((id) => states.get(id)?.completed).length;
  return Math.round((100 * done) / topicIds.length);
}

export type Streaks = { current: number; longest: number; studiedToday: boolean; missedYesterday: boolean; studyDays: number };

/**
 * Streaks over the local days the student studied (YYYY-MM-DD). The current streak
 * still counts if today isn't done yet but yesterday was — the day isn't over.
 */
export function computeStreaks(studied: Iterable<string>, today: string): Streaks {
  const days = new Set(studied);
  const prev = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, dd - 1));
    return x.toISOString().slice(0, 10);
  };
  const studiedToday = days.has(today);
  let cursor = studiedToday ? today : prev(today);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = prev(cursor);
  }
  let longest = 0;
  for (const d of days) {
    if (days.has(prev(d))) continue; // not the start of a run
    let n = 0;
    let c = d;
    while (days.has(c)) {
      n++;
      const [y, m, dd] = c.split('-').map(Number);
      c = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
    }
    longest = Math.max(longest, n);
  }
  return { current, longest, studiedToday, missedYesterday: !studiedToday && !days.has(prev(today)) && days.size > 0, studyDays: days.size };
}

export function formatDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}
