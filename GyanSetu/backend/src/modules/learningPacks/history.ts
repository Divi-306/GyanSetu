import { pool, queryOne } from '../../db/pool';
import type { Outline } from './pack.schema';

/**
 * A student's learning evidence, for personalising new packs and for career guidance.
 *
 * Privacy: built ONLY from learning activity the student synced (packs, topic
 * progress, answers, study time, classic-course progress) and the interests/goals
 * they typed in their profile. Sensitive profile fields (category, income, gender,
 * disability, date of birth) and chat transcripts are never read here.
 */

export type PackEvidence = {
  packId: string;
  title: string;
  subject: string;
  category: string;
  tags: string[];
  goal: string | null;
  durationDays: number | null;
  percent: number;
  topicsCompleted: number;
  topicCount: number;
  answers: number;
  accuracy: number | null; // 0..1
  studyMinutes: number;
  lastActivity: string | null;
  status: 'completed' | 'active' | 'abandoned';
  strongTopics: string[];
  weakTopics: string[];
};

export type LearningEvidence = {
  interests: string[];
  goals: string | null;
  packs: PackEvidence[];
  courses: { title: string; percent: number }[];
  studyDaysLast30: number;
};

const DAY = 86_400_000;

export async function learningEvidence(userId: string): Promise<LearningEvidence> {
  const [profile, packs, topicStats, courses, days] = await Promise.all([
    queryOne<{ interests: string[]; goals: string | null }>('SELECT interests, goals FROM student_profiles WHERE user_id = $1', [userId]),
    pool.query(
      `WITH ids AS (
         SELECT pack_id FROM pack_library WHERE user_id = $1 AND state = 'active'
         UNION SELECT pack_id FROM pack_progress WHERE user_id = $1
         UNION SELECT pack_id FROM pack_topic_progress WHERE user_id = $1
         UNION SELECT pack_id FROM pack_answers WHERE user_id = $1)
       SELECT p.id, p.title, p.subject, p.category, p.goal, p.duration_days, v.outline, coalesce(v.topic_count, 0) AS topic_count,
              (SELECT count(*) FROM pack_topic_progress tp WHERE tp.user_id = $1 AND tp.pack_id = p.id AND tp.completed_at IS NOT NULL)::int AS completed,
              (SELECT coalesce(sum(time_spent_sec), 0) FROM pack_topic_progress tp WHERE tp.user_id = $1 AND tp.pack_id = p.id)::int AS seconds,
              (SELECT count(*) FROM pack_answers a WHERE a.user_id = $1 AND a.pack_id = p.id)::int AS answers,
              (SELECT avg(score) FROM pack_answers a WHERE a.user_id = $1 AND a.pack_id = p.id) AS accuracy,
              GREATEST(
                (SELECT client_updated_at FROM pack_progress pp WHERE pp.user_id = $1 AND pp.pack_id = p.id),
                (SELECT max(answered_at) FROM pack_answers a WHERE a.user_id = $1 AND a.pack_id = p.id),
                (SELECT max(completed_at) FROM pack_topic_progress tp WHERE tp.user_id = $1 AND tp.pack_id = p.id)) AS last_activity
         FROM ids JOIN generated_packs p ON p.id = ids.pack_id
         LEFT JOIN generated_pack_versions v ON v.pack_id = p.id AND v.version = p.latest_ready_version`,
      [userId],
    ),
    pool.query<{ pack_id: string; topic_id: string; n: number; acc: number }>(
      `SELECT pack_id, topic_id, count(*)::int AS n, avg(score) AS acc FROM pack_answers WHERE user_id = $1 GROUP BY 1, 2`,
      [userId],
    ),
    pool.query<{ title: string; percent: number }>(
      `SELECT c.title, sp.percent_complete AS percent FROM student_progress sp JOIN courses c ON c.id = sp.course_id
        WHERE sp.user_id = $1 AND sp.percent_complete > 0`,
      [userId],
    ),
    queryOne<{ n: number }>(
      "SELECT count(*)::int AS n FROM study_days WHERE user_id = $1 AND day > current_date - 30 AND seconds >= 60",
      [userId],
    ),
  ]);

  const now = Date.now();
  return {
    interests: profile?.interests ?? [],
    goals: profile?.goals ?? null,
    courses: courses.rows,
    studyDaysLast30: days?.n ?? 0,
    packs: packs.rows.map((r) => {
      const outline = r.outline as Outline | null;
      const titles = new Map((outline?.modules ?? []).flatMap((m) => m.topics.map((t) => [t.key, t.title] as const)));
      const stats = topicStats.rows.filter((s) => s.pack_id === r.id && s.n >= 2);
      const percent = r.topic_count ? Math.round((100 * r.completed) / r.topic_count) : 0;
      const last = r.last_activity ? new Date(r.last_activity) : null;
      return {
        packId: r.id,
        title: r.title,
        subject: r.subject,
        category: r.category,
        tags: outline?.tags ?? [],
        goal: r.goal,
        durationDays: r.duration_days,
        percent,
        topicsCompleted: r.completed,
        topicCount: r.topic_count,
        answers: r.answers,
        accuracy: r.accuracy == null ? null : Math.round(r.accuracy * 100) / 100,
        studyMinutes: Math.round(r.seconds / 60),
        lastActivity: last?.toISOString() ?? null,
        status: percent >= 90 ? 'completed' : percent < 50 && last && now - last.getTime() > 30 * DAY ? 'abandoned' : 'active',
        strongTopics: stats.filter((s) => s.acc >= 0.8).map((s) => titles.get(s.topic_id) ?? s.topic_id).slice(0, 8),
        weakTopics: stats.filter((s) => s.acc < 0.6).map((s) => titles.get(s.topic_id) ?? s.topic_id).slice(0, 8),
      } satisfies PackEvidence;
    }),
  };
}

export const hasLearningHistory = (e: LearningEvidence) => e.packs.some((p) => p.topicsCompleted > 0 || p.answers > 0) || e.courses.length > 0;

/** Compact text for the curriculum prompt: what the student already knows and struggles with. */
export function learnerProfileText(e: LearningEvidence): string {
  const lines: string[] = [];
  for (const p of e.packs.filter((x) => x.topicsCompleted > 0 || x.answers > 0).slice(0, 15)) {
    lines.push(
      `- ${p.title} (${p.category}): ${p.percent}% done` +
        (p.accuracy != null ? `, quiz accuracy ${Math.round(p.accuracy * 100)}%` : '') +
        (p.strongTopics.length ? `; strong: ${p.strongTopics.slice(0, 4).join(', ')}` : '') +
        (p.weakTopics.length ? `; weak: ${p.weakTopics.slice(0, 4).join(', ')}` : ''),
    );
  }
  for (const c of e.courses.slice(0, 8)) lines.push(`- ${c.title} (course): ${c.percent}% done`);
  return lines.length ? `Previous learning:\n${lines.join('\n')}` : '';
}
