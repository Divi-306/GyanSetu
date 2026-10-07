import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';
import { db, kvGet, kvSet } from '@/db';
import { daysBetween, localDay } from '@/lib/dates';
import { DEFAULT_PREFS, buildReminder, nextReminderAt, type ReminderContext, type ReminderPrefs } from '@/reminders/rules';
import { getContinuePack, getPackDetail } from './learningPacks';

/**
 * Local learning reminders (no server, no push token: they work offline).
 *
 * expo-notifications is loaded lazily and defensively. On this Expo Go build, one of its
 * internal files (DevicePushTokenAutoRegistration, a module-scope side effect unrelated to
 * local notifications) throws on Android as soon as the module is touched at all — despite
 * Expo's own docs saying local notifications remain supported there. Metro's loader swallows
 * that throw and still resolves the dynamic import() below, but hands back a module object
 * with some functions simply missing (`undefined`), rather than rejecting. So a plain
 * `cached !== null` check isn't enough: loadNotifications() also checks that every function
 * this file actually calls is present and callable, and treats the module as unavailable
 * otherwise. Every call site is still wrapped in try/catch too, as a second line of defence.
 * This is the only place in the app that touches expo-notifications; any failure here just
 * turns reminders off for this session instead of crashing anything.
 */

const PREFS_KEY = 'reminder.prefs';
const SCHEDULED_KEY = 'reminder.scheduled'; // { id, fireAt }
const LAST_FIRED_KEY = 'reminder.lastFiredAt';
const CHANNEL = 'learning-reminders';

type N = typeof NotificationsModule;
let cached: N | null | undefined;

// Every function/value this file calls on the module. If any is missing, the module is
// treated as entirely unusable rather than guessing which calls are still safe.
const REQUIRED_MEMBERS = [
  'setNotificationHandler',
  'setNotificationChannelAsync',
  'getPermissionsAsync',
  'requestPermissionsAsync',
  'cancelScheduledNotificationAsync',
  'scheduleNotificationAsync',
  'getLastNotificationResponseAsync',
  'addNotificationResponseReceivedListener',
  'AndroidImportance',
  'SchedulableTriggerInputTypes',
] as const;

function isUsable(mod: unknown): mod is N {
  if (!mod || typeof mod !== 'object') return false;
  return REQUIRED_MEMBERS.every((key) => (mod as Record<string, unknown>)[key] != null);
}

async function loadNotifications(): Promise<N | null> {
  if (cached !== undefined) return cached;
  try {
    const mod: unknown = await import('expo-notifications');
    if (isUsable(mod)) {
      cached = mod;
    } else {
      console.warn('[reminders] expo-notifications loaded but some functions are missing on this device; reminders are disabled this session.');
      cached = null;
    }
  } catch (err) {
    console.warn('[reminders] expo-notifications unavailable; reminders are disabled this session.', err);
    cached = null;
  }
  return cached;
}

/** Whether reminders can work at all on this build/device (distinct from the OS permission). */
export async function notificationsAvailable(): Promise<boolean> {
  return (await loadNotifications()) !== null;
}

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  return { ...DEFAULT_PREFS, ...((await kvGet<Partial<ReminderPrefs>>(PREFS_KEY)) ?? {}) };
}

export async function setReminderPrefs(patch: Partial<ReminderPrefs>): Promise<ReminderPrefs> {
  const prefs = { ...(await getReminderPrefs()), ...patch };
  await kvSet(PREFS_KEY, prefs);
  await rescheduleReminder();
  return prefs;
}

/** Show reminders while the app is open too, and give Android its own channel. No-op if unavailable. */
export async function configureNotifications() {
  const n = await loadNotifications();
  if (!n) return;
  try {
    n.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync(CHANNEL, { name: 'Learning reminders', importance: n.AndroidImportance.DEFAULT });
    }
  } catch (err) {
    console.warn('[reminders] could not configure notifications', err);
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const n = await loadNotifications();
  if (!n) return false;
  try {
    const current = await n.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await n.requestPermissionsAsync()).granted;
  } catch (err) {
    console.warn('[reminders] permission check failed', err);
    return false;
  }
}

async function reminderContext(): Promise<{ ctx: ReminderContext; url: string }> {
  const resume = await getContinuePack();
  const last = await db.getFirstAsync<{ day: string | null }>('SELECT max(day) AS day FROM study_days WHERE seconds > 0');
  const daysInactive = last?.day ? daysBetween(last.day, localDay()) : 0;
  if (!resume) {
    return {
      ctx: { packTitle: null, nextTopicTitle: null, dayNumber: null, durationDays: null, lastCompletedDay: null, nextDay: null, percent: 0, dailyMinutes: null, weakTopic: null, daysInactive },
      url: '/learn',
    };
  }
  const detail = await getPackDetail(resume.packId);
  const weak = detail?.weakTopics[0] ?? null;
  const days = detail?.days ?? [];
  const lastDone = [...days].reverse().find((d) => d.status === 'done');
  const next = days.find((d) => d.status !== 'done');
  return {
    ctx: {
      packTitle: resume.title,
      nextTopicTitle: resume.topicTitle,
      dayNumber: resume.dayNumber,
      durationDays: resume.durationDays,
      lastCompletedDay: lastDone ? { number: lastDone.dayNumber, title: lastDone.title } : null,
      nextDay: next ? { number: next.dayNumber, title: next.title } : null,
      percent: resume.percent,
      dailyMinutes: detail?.plan?.dailyMinutes ?? null,
      weakTopic: weak?.title ?? null,
      daysInactive,
    },
    url: weak
      ? `/packs/${resume.packId}/tutor?q=${encodeURIComponent(`Quiz me on ${weak.title}`)}`
      : resume.topicId
        ? `/packs/${resume.packId}/topic/${resume.topicId}`
        : `/packs/${resume.packId}`,
  };
}

/** Cancels the pending reminder and schedules the next one (or none, when off / not allowed / unavailable). */
export async function rescheduleReminder() {
  const n = await loadNotifications();
  if (!n) return null;
  try {
    const prev = await kvGet<{ id: string; fireAt: string }>(SCHEDULED_KEY);
    if (prev) await n.cancelScheduledNotificationAsync(prev.id).catch(() => {});
    const prefs = await getReminderPrefs();
    const permitted = prefs.enabled && (await n.getPermissionsAsync()).granted;
    if (!permitted) {
      await kvSet(SCHEDULED_KEY, null);
      return null;
    }
    const lastOpened = await db.getFirstAsync<{ at: string | null }>('SELECT max(last_opened_at) AS at FROM lp_packs');
    const now = new Date();
    // A reminder whose time has passed was shown: the next one waits a full interval after it.
    if (prev && new Date(prev.fireAt) <= now) await kvSet(LAST_FIRED_KEY, prev.fireAt);
    const lastFired = await kvGet<string>(LAST_FIRED_KEY);
    const lastReminderAt = lastFired ? new Date(lastFired) : null;
    const fireAt = nextReminderAt({ lastStudyAt: lastOpened?.at ? new Date(lastOpened.at) : null, lastReminderAt, now, prefs });
    if (!fireAt) return null;
    const { ctx, url } = await reminderContext();
    const { title, body } = buildReminder({ ...ctx, daysInactive: Math.max(ctx.daysInactive, prefs.frequencyDays) });
    const id = await n.scheduleNotificationAsync({
      content: { title, body, data: { url } },
      trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL },
    });
    await kvSet(SCHEDULED_KEY, { id, fireAt: fireAt.toISOString() });
    return fireAt;
  } catch (err) {
    console.warn('[reminders] could not schedule', err);
    return null;
  }
}

/** For the in-app nudge on the dashboard (no notification needed while they're looking at the app). */
export async function inactivityNudge() {
  const prefs = await getReminderPrefs();
  const { ctx, url } = await reminderContext();
  if (ctx.daysInactive < Math.max(2, prefs.frequencyDays) || !ctx.packTitle) return null;
  return { ...buildReminder(ctx), url };
}

/**
 * Lets the root layout react to a tapped reminder without importing expo-notifications
 * itself. Calls `onUrl` with the reminder's target route, once, if one was tapped (including
 * one that was tapped while the app was closed). No-op cleanup if notifications are unavailable.
 */
export function onNotificationOpened(onUrl: (url: string) => void): () => void {
  let sub: { remove: () => void } | null = null;
  let cancelled = false;
  const urlOf = (response: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') onUrl(url);
  };
  void loadNotifications()
    .then((n) => {
      if (!n || cancelled) return;
      try {
        n.getLastNotificationResponseAsync()
          .then(urlOf)
          .catch((err) => console.warn('[reminders] could not read the last notification', err));
        sub = n.addNotificationResponseReceivedListener(urlOf);
      } catch (err) {
        console.warn('[reminders] could not attach the notification listener', err);
      }
    })
    .catch((err) => console.warn('[reminders] onNotificationOpened setup failed', err));
  return () => {
    cancelled = true;
    try {
      sub?.remove();
    } catch {
      // already gone; nothing to do
    }
  };
}
