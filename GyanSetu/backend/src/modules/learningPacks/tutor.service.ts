import { z } from 'zod';
import { HttpError, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { replyLanguage, unescapeNewlines } from '../ai/ai.service';
import { aiConfigured, complete } from '../ai/providers';
import { loadPackContent } from './generator';
import { QUESTIONS_JSON_SCHEMA, QUIZ_JSON_SCHEMA, sanitizeQuestions, type LearningPackContent, type Topic } from './pack.schema';
import { FLASHCARDS_SYSTEM, INSIGHTS_SYSTEM, QUESTIONS_SYSTEM, QUIZ_SYSTEM, TUTOR_SYSTEM, insightsUser, questionsUser, quizUser, tutorUser } from './prompts';
import { findTopic, searchTopics } from './search';

const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

const requireAi = () => {
  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Online AI is not available right now');
};
const unreadable = () => new HttpError(502, 'AI_UNAVAILABLE', 'The AI tutor is unavailable right now');

/** The parts of a topic a tutor needs, trimmed so a few topics fit comfortably in one prompt. */
function topicMaterial(t: Topic, moduleTitle: string): string {
  const parts = [
    `## ${t.title} (module: ${moduleTitle})`,
    t.explanation.slice(0, 3000),
    t.keyPoints.length ? `Key points:\n- ${t.keyPoints.join('\n- ')}` : '',
    t.analogy ? `Analogy: ${t.analogy}` : '',
    t.examples.slice(0, 2).map((e) => `Example — ${e.title}: ${e.body}${e.code ? `\n${e.code}` : ''}`).join('\n'),
    t.formulas.length ? `Formulas: ${t.formulas.map((f) => `${f.name}: ${f.expression}`).join('; ')}` : '',
    t.commonMistakes.length ? `Common mistakes: ${t.commonMistakes.map((m) => `${m.mistake} → ${m.correction}`).join('; ')}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

// ─────────────────────────── Online tutor ───────────────────────────

const TutorAnswer = z.object({
  answer: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  groundedInPack: z.boolean(),
  usedTopicIds: z.array(z.string()),
  suggestedFollowUps: z.array(z.string()),
});

const TUTOR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'confidence', 'groundedInPack', 'usedTopicIds', 'suggestedFollowUps'],
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    groundedInPack: { type: 'boolean' },
    usedTopicIds: { type: 'array', items: { type: 'string' } },
    suggestedFollowUps: { type: 'array', items: { type: 'string' } },
  },
};

export type StudentContext = {
  currentTopicId?: string;
  completedTopicIds?: string[];
  weakTopicIds?: string[];
  percent?: number;
};

export type TutorInput = {
  packId: string;
  question: string;
  topicId?: string;
  history?: { role: 'user' | 'tutor'; text: string }[];
  context?: StudentContext;
};

const titleOf = (pack: LearningPackContent, id: string) => findTopic(pack, id)?.topic.title ?? id;

export async function askPackTutor(input: TutorInput) {
  requireAi();
  const pack = await loadPackContent(input.packId);

  // The topic on screen plus the best matches for the question.
  const hits = searchTopics(pack, input.question, 3);
  const focus = input.topicId ? findTopic(pack, input.topicId) : null;
  const chosen = new Map<string, { topic: Topic; moduleTitle: string }>();
  if (focus) chosen.set(focus.topic.id, { topic: focus.topic, moduleTitle: focus.module.title });
  for (const h of hits) if (chosen.size < 3) chosen.set(h.topic.id, h);

  const material = [...chosen.values()]
    .map(({ topic, moduleTitle }) => `<topic id="${topic.id}">\n${topicMaterial(topic, moduleTitle)}\n</topic>`)
    .join('\n');
  const ctx = input.context ?? {};
  const context = [
    `Pack: ${pack.title} (${pack.levelRange.from} → ${pack.levelRange.to})`,
    ctx.currentTopicId ? `Current topic: ${titleOf(pack, ctx.currentTopicId)}` : '',
    ctx.percent != null ? `Progress: ${ctx.percent}%` : '',
    ctx.completedTopicIds?.length ? `Completed: ${ctx.completedTopicIds.slice(0, 30).map((id) => titleOf(pack, id)).join(', ')}` : '',
    ctx.weakTopicIds?.length ? `Weak topics: ${ctx.weakTopicIds.slice(0, 10).map((id) => titleOf(pack, id)).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const history = (input.history ?? [])
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.text.slice(0, 600)}`)
    .join('\n');

  const result = await complete({
    system: TUTOR_SYSTEM,
    user: tutorUser({ material, context, history, question: input.question, replyLanguage: replyLanguage(input.question) }),
    schema: TUTOR_JSON_SCHEMA,
    schemaName: 'pack_tutor_answer',
  });
  if (result.kind === 'refused') {
    return {
      answer: "I can't help with that. Ask me something about this learning pack.",
      confidence: 'low' as const, groundedInPack: false, topics: [], suggestedFollowUps: [], mode: 'online' as const,
    };
  }
  const parsed = TutorAnswer.safeParse(parseJson(result.text));
  if (!parsed.success) {
    logger.error({ model: result.model }, 'pack tutor reply did not match the schema');
    throw unreadable();
  }
  // Only cite topics we actually sent.
  const topics = parsed.data.usedTopicIds
    .filter((id) => chosen.has(id))
    .map((id) => ({ topicId: id, title: chosen.get(id)!.topic.title }));
  return {
    answer: unescapeNewlines(parsed.data.answer),
    confidence: parsed.data.confidence,
    groundedInPack: parsed.data.groundedInPack && topics.length > 0,
    topics,
    suggestedFollowUps: parsed.data.suggestedFollowUps.slice(0, 3),
    mode: 'online' as const,
  };
}

// ─────────────────────────── Quiz & viva generator ───────────────────────────

export async function generateTopicQuestions(input: {
  packId: string;
  topicId: string;
  mcqCount: number;
  vivaCount: number;
  difficulty: string;
  weakPoints: string[];
}) {
  requireAi();
  const pack = await loadPackContent(input.packId);
  const found = findTopic(pack, input.topicId);
  if (!found) throw notFound('Topic');
  const { topic } = found;
  const { mcqs: _m, viva: _v, practice: _p, flashcards: _f, videos: _vid, ...material } = topic;
  const existing = [...topic.mcqs.map((q) => q.question), ...topic.viva.map((q) => q.question)];

  const result = await complete({
    system: QUESTIONS_SYSTEM,
    user: questionsUser({ topic: material, existing, ...input }),
    schema: QUESTIONS_JSON_SCHEMA,
    schemaName: 'topic_questions',
    maxTokens: 6000,
    timeoutMs: 90_000,
  });
  if (result.kind === 'refused') throw unreadable();
  const raw = parseJson(result.text) as { mcqs?: unknown[]; viva?: unknown[] } | undefined;
  if (!raw || !Array.isArray(raw.mcqs) || !Array.isArray(raw.viva)) throw unreadable();

  // Fresh ids each time: these are added to the student's local bank, never replacing pack items.
  const stamp = Date.now().toString(36);
  return {
    topicId: topic.id,
    mcqs: sanitizeQuestions.mcqs(raw.mcqs, input.mcqCount).map((q, i) => ({ id: `${topic.id}~xmcq-${stamp}-${i + 1}`, ...q })),
    viva: sanitizeQuestions.viva(raw.viva, input.vivaCount).map((q, i) => ({ id: `${topic.id}~xviva-${stamp}-${i + 1}`, ...q })),
  };
}

// ─────────────────────────── Standalone quiz generator ───────────────────────────
// "Generate Quiz" on a whole pack (or chosen topics): a self-contained, savable quiz.

const MAX_QUIZ_TOPICS = 12;

export async function generateQuiz(input: {
  packId: string;
  topicIds?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
}) {
  requireAi();
  const pack = await loadPackContent(input.packId);
  const allTopics = pack.modules.flatMap((m) => m.topics.map((t) => ({ topic: t, moduleTitle: m.title })));
  const known = new Set(allTopics.map((t) => t.topic.id));
  let chosen = input.topicIds?.length ? allTopics.filter((t) => input.topicIds!.includes(t.topic.id)) : allTopics;
  if (chosen.length === 0) chosen = allTopics;
  if (chosen.length > MAX_QUIZ_TOPICS) {
    // Spread the pick evenly across the chosen topics rather than only the first N.
    const step = chosen.length / MAX_QUIZ_TOPICS;
    chosen = Array.from({ length: MAX_QUIZ_TOPICS }, (_, i) => chosen[Math.floor(i * step)]);
  }

  const result = await complete({
    system: QUIZ_SYSTEM,
    user: quizUser({
      topics: chosen.map(({ topic, moduleTitle }) => ({ id: topic.id, title: topic.title, material: topicMaterial(topic, moduleTitle) })),
      difficulty: input.difficulty,
      count: input.count,
    }),
    schema: QUIZ_JSON_SCHEMA,
    schemaName: 'pack_quiz',
    maxTokens: Math.min(8000, 400 * input.count + 1000),
    timeoutMs: 90_000,
  });
  if (result.kind === 'refused') throw unreadable();
  const raw = parseJson(result.text) as { questions?: unknown[] } | undefined;
  if (!raw || !Array.isArray(raw.questions)) throw unreadable();

  const stamp = Date.now().toString(36);
  const questions = sanitizeQuestions
    .quiz(raw.questions, input.count)
    .filter((q) => known.has(q.topicId))
    .map((q, i) => ({ id: `${pack.packId}~quiz-${stamp}-${i + 1}`, ...q }));

  return {
    subject: pack.title,
    difficulty: input.difficulty,
    topicIds: [...new Set(chosen.map((c) => c.topic.id))],
    questions,
  };
}

// ─────────────────────────── Flashcard generator ───────────────────────────

const FLASHCARDS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['flashcards'],
  properties: {
    flashcards: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['front', 'back'], properties: { front: { type: 'string' }, back: { type: 'string' } } },
    },
  },
};

export async function generateTopicFlashcards(input: { packId: string; topicId: string; count: number }) {
  requireAi();
  const pack = await loadPackContent(input.packId);
  const found = findTopic(pack, input.topicId);
  if (!found) throw notFound('Topic');
  const { topic } = found;
  const { mcqs: _m, viva: _v, practice: _p, flashcards, videos: _vid, ...material } = topic;
  const result = await complete({
    system: FLASHCARDS_SYSTEM,
    user: `<topic_material>\n${JSON.stringify(material)}\n</topic_material>\n\n<existing_cards>\n${flashcards.map((f) => f.front).join('\n') || '(none)'}\n</existing_cards>\n\n<request>${input.count} cards</request>`,
    schema: FLASHCARDS_JSON_SCHEMA,
    schemaName: 'topic_flashcards',
    maxTokens: 3000,
  });
  if (result.kind === 'refused') throw unreadable();
  const raw = parseJson(result.text) as { flashcards?: unknown[] } | undefined;
  if (!raw || !Array.isArray(raw.flashcards)) throw unreadable();
  const stamp = Date.now().toString(36);
  return {
    topicId: topic.id,
    flashcards: sanitizeQuestions.flashcards(raw.flashcards, input.count).map((f, i) => ({ id: `${topic.id}~xcard-${stamp}-${i + 1}`, ...f })),
  };
}

// ─────────────────────────── Progress analyzer ───────────────────────────

const Insights = z.object({
  summary: z.string(),
  weakTopicIds: z.array(z.string()),
  strongTopicIds: z.array(z.string()),
  misconceptions: z.array(z.string()),
  nextSteps: z.array(z.object({ action: z.string(), topicId: z.string() })),
});

const INSIGHTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'weakTopicIds', 'strongTopicIds', 'misconceptions', 'nextSteps'],
  properties: {
    summary: { type: 'string' },
    weakTopicIds: { type: 'array', items: { type: 'string' } },
    strongTopicIds: { type: 'array', items: { type: 'string' } },
    misconceptions: { type: 'array', items: { type: 'string' } },
    nextSteps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['action', 'topicId'],
        properties: { action: { type: 'string' }, topicId: { type: 'string' } },
      },
    },
  },
};

export type TopicStats = {
  topicId: string;
  completed: boolean;
  attempts: number;
  accuracy: number | null;
  timeSpentSec: number;
  recentWrong: string[];
};

export async function analyzeProgress(packId: string, topics: TopicStats[]) {
  requireAi();
  const pack = await loadPackContent(packId);
  const outline = pack.modules
    .map((m) => `${m.position}. ${m.title}: ${m.topics.map((t) => `${t.title} [${t.id}]`).join(', ')}`)
    .join('\n');
  const result = await complete({
    system: INSIGHTS_SYSTEM,
    user: insightsUser({ pack: `${pack.title}\n${outline}`, progress: topics }),
    schema: INSIGHTS_JSON_SCHEMA,
    schemaName: 'progress_insights',
    maxTokens: 3000,
  });
  if (result.kind === 'refused') throw unreadable();
  const parsed = Insights.safeParse(parseJson(result.text));
  if (!parsed.success) throw unreadable();
  const known = new Set(pack.modules.flatMap((m) => m.topics.map((t) => t.id)));
  const d = parsed.data;
  return {
    summary: d.summary,
    weakTopicIds: d.weakTopicIds.filter((id) => known.has(id)),
    strongTopicIds: d.strongTopicIds.filter((id) => known.has(id)),
    misconceptions: d.misconceptions.slice(0, 5),
    nextSteps: d.nextSteps.slice(0, 5).map((s) => ({ action: s.action, topicId: known.has(s.topicId) ? s.topicId : null })),
  };
}
