import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db, kvGet, kvSet } from '@/db';
import { daysBetween, localDay } from '@/lib/dates';
import { DEFAULT_PREFS, buildReminder, nextReminderAt, type ReminderContext, type ReminderPrefs } from '@/reminders/rules';
import { getContinuePack, getPackDetail } from './learningPacks';

/**
 * Local learning reminders (no server, no push token: they work in Expo Go and offline).
 * One reminder is kept scheduled at a time and rescheduled whenever the app goes to
 * the background, so it always reflects the latest study session and progress.
 */

const PREFS_KEY = 'reminder.prefs';
const SCHEDULED_KEY = 'reminder.scheduled'; // { id, fireAt }
const LAST_FIRED_KEY = 'reminder.lastFiredAt';
const CHANNEL = 'learning-reminders';

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  return { ...DEFAULT_PREFS, ...((await kvGet<Partial<ReminderPrefs>>(PREFS_KEY)) ?? {}) };
}

export async function setReminderPrefs(patch: Partial<ReminderPrefs>): Promise<ReminderPrefs> {
  const prefs = { ...(await getReminderPrefs()), ...patch };
  await kvSet(PREFS_KEY, prefs);
  await rescheduleReminder();
  return prefs;
}

/** Show reminders while the app is open too, and give Android its own channel. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Learning reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
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

/** Cancels the pending reminder and schedules the next one (or none, when off / not allowed). */
export async function rescheduleReminder() {
  const prev = await kvGet<{ id: string; fireAt: string }>(SCHEDULED_KEY);
  if (prev) await Notifications.cancelScheduledNotificationAsync(prev.id).catch(() => {});
  const prefs = await getReminderPrefs();
  const permitted = prefs.enabled && (await Notifications.getPermissionsAsync()).granted;
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
  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { url } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL },
  });
  await kvSet(SCHEDULED_KEY, { id, fireAt: fireAt.toISOString() });
  return fireAt;
}

/** For the in-app nudge on the dashboard (no notification needed while they're looking at the app). */
export async function inactivityNudge() {
  const prefs = await getReminderPrefs();
  const { ctx, url } = await reminderContext();
  if (ctx.daysInactive < Math.max(2, prefs.frequencyDays) || !ctx.packTitle) return null;
  return { ...buildReminder(ctx), url };
}
