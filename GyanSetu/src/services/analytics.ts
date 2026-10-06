import { db } from '@/db';
import { addDays, localDay } from '@/lib/dates';
import { computeStreaks, isStrong, isWeak, percentComplete } from '@/tutor/progress';
import { getContinuePack, topicStates } from './learningPacks';

/** Everything the Progress screen and dashboard show. Local data only, so it works offline. */
export async function getProgressOverview() {
  const today = localDay();
  const packs = await db.getAllAsync<{ pack_id: string; title: string; icon: string; duration_days: number | null }>(
    'SELECT pack_id, title, icon, duration_days FROM lp_packs ORDER BY coalesce(last_opened_at, downloaded_at) DESC',
  );
  let completed = 0;
  let total = 0;
  const strong: { packTitle: string; title: string }[] = [];
  const weak: { packId: string; packTitle: string; topicId: string; title: string; accuracy: number }[] = [];
  const perPack: { packId: string; title: string; icon: string; percent: number }[] = [];
  for (const p of packs) {
    const topics = await db.getAllAsync<{ id: string; title: string }>('SELECT id, title FROM lp_topics WHERE pack_id = ? ORDER BY position', p.pack_id);
    const states = await topicStates(p.pack_id);
    const ids = topics.map((t) => t.id);
    completed += ids.filter((id) => states.get(id)?.completed).length;
    total += ids.length;
    perPack.push({ packId: p.pack_id, title: p.title, icon: p.icon, percent: percentComplete(ids, states) });
    for (const t of topics) {
      const s = states.get(t.id);
      if (isStrong(s)) strong.push({ packTitle: p.title, title: t.title });
      if (isWeak(s)) weak.push({ packId: p.pack_id, packTitle: p.title, topicId: t.id, title: t.title, accuracy: s!.recentAccuracy! });
    }
  }

  const days = await db.getAllAsync<{ day: string; seconds: number }>('SELECT day, seconds FROM study_days ORDER BY day');
  const byDay = new Map(days.map((d) => [d.day, d.seconds]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, minutes: Math.round((byDay.get(day) ?? 0) / 60) };
  });
  const answers = await db.getFirstAsync<{ n: number; avg: number | null }>('SELECT count(*) AS n, avg(score) AS avg FROM lp_answers');
  const topicTime = await db.getFirstAsync<{ s: number | null }>('SELECT sum(time_spent_sec) AS s FROM lp_topic_progress');
  const studySeconds = Math.max(days.reduce((s, d) => s + d.seconds, 0), topicTime?.s ?? 0);

  return {
    overallPercent: total ? Math.round((100 * completed) / total) : 0,
    topicsCompleted: completed,
    topicsRemaining: total - completed,
    packs: perPack,
    current: await getContinuePack(),
    week,
    streaks: computeStreaks(days.filter((d) => d.seconds >= 60).map((d) => d.day), today),
    lastStudyDay: days.at(-1)?.day ?? null,
    studySeconds,
    answers: answers?.n ?? 0,
    accuracy: answers?.avg ?? null,
    strong: strong.slice(0, 6),
    weak: weak.sort((a, b) => a.accuracy - b.accuracy).slice(0, 6),
  };
}

export type ProgressOverview = Awaited<ReturnType<typeof getProgressOverview>>;
