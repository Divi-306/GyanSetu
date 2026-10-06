import { slugify, type Depth, type Outline, type OutlineTopic, type PlanReply } from './pack.schema';
import type { z } from 'zod';

type PlanResult = z.infer<typeof PlanReply>;

const PRACTICE_MODULE = { key: 'practice-projects-assessment', title: 'Practice, Projects & Assessment' };

/** A duration can't make anyone an expert; the statement must say what the days realistically build. */
const OVERCLAIM = /\b(complete(ly)?|everything|fully|entire(ly)?|all (of|about)|master(ing|y)? (all|every)|become an? (expert|master|pro)|guarantee)/i;

const LEAD: Record<Depth, string> = {
  foundation: 'Build a strong foundation in',
  intermediate: 'Strengthen your core skills in',
  advanced: 'Go deeper into',
  professional: 'Sharpen professional-level skills in',
};

export function honestCoverage(statement: string, depth: Depth, subject: string, days: number): string {
  const s = statement.trim();
  if (s.length >= 20 && !OVERCLAIM.test(s)) return s;
  return `${LEAD[depth]} ${subject} in ${days} day${days === 1 ? '' : 's'}.`;
}

/**
 * Turns the duration planner's reply into a plan that is always valid:
 * - exactly `durationDays` days, numbered 1..N;
 * - every topic scheduled on exactly one day, in curriculum order where the model left gaps;
 * - no empty day (an empty day gets a generated revision topic reviewing the days before it);
 * - planner-added topics (revision / practice / project / assessment) placed in an existing
 *   module or in a final "Practice, Projects & Assessment" module.
 * The model plans; this function guarantees the invariants the app relies on.
 */
export function applyPlan(
  outline: Outline,
  reply: PlanResult,
  req: { durationDays: number; dailyMinutes: number; goal: string | null },
): Outline {
  const N = req.durationDays;
  const modules = outline.modules.map((m) => ({ ...m, topics: m.topics.map((t) => ({ ...t })) }));
  const taken = new Set(modules.flatMap((m) => m.topics.map((t) => t.key)));
  const uniqueKey = (raw: string, fallback: string) => {
    const base = slugify(raw || fallback);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    taken.add(key);
    return key;
  };
  const practiceModule = () => {
    let m = modules.find((x) => x.key === PRACTICE_MODULE.key);
    if (!m) {
      m = { key: PRACTICE_MODULE.key, title: PRACTICE_MODULE.title, description: 'Revision, practice, projects and the final assessment.', topics: [] };
      modules.push(m);
    }
    return m;
  };

  // 1. Planner-added topics. Its day plan refers to them by the key it chose; map to our unique key.
  const keyMap = new Map<string, string>();
  for (const x of reply.extraTopics) {
    const key = uniqueKey(x.key, x.title);
    keyMap.set(x.key, key);
    keyMap.set(slugify(x.key), key);
    const target = modules.find((m) => m.key === x.moduleKey && x.kind === 'lesson') ?? practiceModule();
    target.topics.push({ key, title: x.title, summary: x.summary, difficulty: x.difficulty, kind: x.kind, priority: 'important', estimatedMinutes: x.estimatedMinutes });
  }
  const allTopics = modules.flatMap((m) => m.topics);
  const byKey = new Map(allTopics.map((t) => [t.key, t]));
  const resolve = (k: string) => keyMap.get(k) ?? keyMap.get(slugify(k)) ?? (byKey.has(k) ? k : byKey.has(slugify(k)) ? slugify(k) : null);

  // 2. The model's days by their dayNumber; days past N merge into the last one, a skipped
  //    number stays empty (and becomes a revision day below).
  const days = Array.from({ length: N }, () => ({ title: '', focus: '', estimatedMinutes: 0, completionCriteria: '', topicKeys: [] as string[] }));
  const dayOf = new Map<string, number>();
  for (const d of [...reply.days].sort((a, b) => a.dayNumber - b.dayNumber)) {
    const index = Math.max(0, Math.min(d.dayNumber - 1, N - 1));
    const slot = days[index];
    slot.title ||= d.title;
    slot.focus ||= d.focus;
    slot.estimatedMinutes += d.estimatedMinutes;
    slot.completionCriteria ||= d.completionCriteria;
    for (const raw of d.topicKeys) {
      const key = resolve(raw);
      if (key && !dayOf.has(key)) {
        dayOf.set(key, index);
        slot.topicKeys.push(key);
      }
    }
  }

  // 3. Topics the plan forgot: same day as the topic before them in the curriculum (or day 1).
  let lastDay = 0;
  for (const t of allTopics) {
    const d = dayOf.get(t.key);
    if (d !== undefined) {
      lastDay = d;
      continue;
    }
    dayOf.set(t.key, lastDay);
    days[lastDay].topicKeys.push(t.key);
  }

  // 4. Empty days become revision days for what came before.
  let reviewedFrom = 1;
  days.forEach((d, i) => {
    if (d.topicKeys.length > 0) {
      if (byKey.get(d.topicKeys[0])?.kind === 'revision') reviewedFrom = i + 2;
      return;
    }
    const range = reviewedFrom <= i ? `Days ${reviewedFrom}–${i}` : 'the plan so far';
    const key = uniqueKey(`revision-day-${i + 1}`, `revision-day-${i + 1}`);
    const topic: OutlineTopic = {
      key, title: `Revision & practice: ${range}`, summary: `Review and practise everything from ${range}.`,
      difficulty: outline.level, kind: 'revision', priority: 'important', estimatedMinutes: req.dailyMinutes,
    };
    practiceModule().topics.push(topic);
    byKey.set(key, topic);
    dayOf.set(key, i);
    d.topicKeys.push(key);
    d.title ||= topic.title;
    reviewedFrom = i + 2;
  });

  // 5. Stamp day numbers on topics; fill titles and realistic minutes.
  for (const m of modules) for (const t of m.topics) t.dayNumber = (dayOf.get(t.key) ?? 0) + 1;
  const planDays = days.map((d, i) => {
    const minutes = d.topicKeys.reduce((s, k) => s + (byKey.get(k)?.estimatedMinutes ?? 20), 0);
    return {
      dayNumber: i + 1,
      title: d.title || byKey.get(d.topicKeys[0])?.title || `Day ${i + 1}`,
      focus: d.focus,
      topicKeys: d.topicKeys,
      estimatedMinutes: Math.max(10, Math.min(Math.round(req.dailyMinutes * 1.5), d.estimatedMinutes || minutes)),
      completionCriteria: d.completionCriteria || 'Finish the day’s topics and score at least 70% on their quiz.',
    };
  });

  return {
    ...outline,
    modules: modules.filter((m) => m.topics.length > 0),
    estimatedHours: Math.max(1, Math.round((planDays.reduce((s, d) => s + d.estimatedMinutes, 0) / 60) * 10) / 10),
    careerPaths: reply.careerPaths,
    plan: {
      durationDays: N,
      dailyMinutes: req.dailyMinutes,
      goal: req.goal,
      depth: reply.depth,
      coverageStatement: honestCoverage(reply.coverageStatement, reply.depth, outline.subject, N),
      outcomes: reply.outcomes,
      notCovered: reply.notCovered,
      days: planDays,
    },
  };
}
