import { z } from 'zod';

/**
 * Learning pack format, schemaVersion 3 (subject-agnostic, AI-generated).
 * The app's offline tutor reads exactly this structure, so every field a tutor
 * needs (simple explanation, analogy, viva model answers, hints...) is generated
 * up front: offline there is no model to fill gaps.
 *
 * v3 adds an optional day plan (duration-based packs), topic kinds and videos.
 * Days are a schedule over topics — every day has at least one topic (revision,
 * project and assessment days included) — so progress, the offline tutor, sync
 * and versioning work on topics exactly as before. v2 packs simply have no plan.
 */

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const CATEGORIES = [
  'programming', 'mathematics', 'science', 'engineering', 'theory', 'language', 'humanities', 'commerce', 'other',
] as const;
export const PRACTICE_TYPES = ['coding', 'numerical', 'written', 'debugging', 'diagram'] as const;
export const TOPIC_KINDS = ['lesson', 'practice', 'project', 'revision', 'assessment'] as const;
export const PRIORITIES = ['core', 'important', 'optional'] as const;
export const DEPTHS = ['foundation', 'intermediate', 'advanced', 'professional'] as const;

export type Level = (typeof LEVELS)[number];
export type TopicKind = (typeof TOPIC_KINDS)[number];
export type Depth = (typeof DEPTHS)[number];

/**
 * A short educational video found through a provider API (never invented by the
 * model). `downloadable` is true only for public-domain / openly licensed files
 * the student may keep offline; everything else is stream-only.
 */
export type Video = {
  id: string;
  topicId: string;
  title: string;
  description: string;
  durationSec: number | null;
  source: 'wikimedia' | 'youtube';
  url: string; // page to watch / stream
  downloadUrl: string | null; // direct file, only when downloadable
  thumbnail: string | null;
  license: string;
  attribution: string;
  downloadable: boolean;
  sizeBytes: number | null;
};

export type PlanDay = {
  dayNumber: number;
  title: string;
  focus: string;
  topicIds: string[];
  estimatedMinutes: number;
  completionCriteria: string;
};

/** What a duration-based pack promises, honestly: depth, coverage, and what is left out. */
export type Plan = {
  durationDays: number;
  dailyMinutes: number;
  goal: string | null;
  depth: Depth;
  coverageStatement: string;
  outcomes: string[];
  notCovered: string[];
  days: PlanDay[];
};

export type Mcq = { id: string; question: string; options: string[]; correctIndex: number; explanation: string; difficulty: Level };
export type Viva = { id: string; question: string; expectedAnswer: string; keyPoints: string[]; followUp: string };
export type Practice = {
  id: string; type: (typeof PRACTICE_TYPES)[number]; prompt: string; hints: string[]; solution: string; answerKeywords: string[];
};
export type Flashcard = { id: string; front: string; back: string };

export type Topic = {
  id: string;
  key: string;
  position: number;
  kind: TopicKind;
  dayNumber: number | null;
  title: string;
  difficulty: Level;
  estimatedMinutes: number;
  objectives: string[];
  explanation: string; // markdown
  simpleExplanation: string;
  analogy: string;
  keyPoints: string[];
  examples: { title: string; body: string; code: string; language: string; steps: string[] }[];
  formulas: { name: string; expression: string; meaning: string }[];
  commonMistakes: { mistake: string; correction: string }[];
  mcqs: Mcq[];
  viva: Viva[];
  practice: Practice[];
  flashcards: Flashcard[];
  summary: string;
  keywords: string[];
  videos: Video[];
};

export type Module = {
  id: string;
  key: string;
  position: number;
  title: string;
  description: string;
  objectives: string[];
  summary: string;
  revisionNotes: string; // markdown
  topics: Topic[];
};

export type LearningPackContent = {
  schemaVersion: 3;
  packId: string;
  version: number;
  title: string;
  subject: string;
  description: string;
  category: string;
  level: Level;
  levelRange: { from: Level; to: Level };
  icon: string;
  language: string;
  createdAt: string;
  generatedBy: { model: string | null; source: 'ai' | 'course' };
  metadata: {
    estimatedMinutes: number;
    prerequisites: string[];
    learningObjectives: string[];
    tags: string[];
    moduleCount: number;
    topicCount: number;
  };
  plan: Plan | null;
  careerPaths: { title: string; relevance: string }[];
  modules: Module[];
  glossary: { term: string; definition: string; moduleId: string }[];
  /** How to carry progress over from the previous version. Topic ids are stable; these were dropped. */
  migration: { fromVersion: number; removedTopicIds: string[] } | null;
};

/** The outline stored on a version and shown to the student before content is ready. */
export type Outline = {
  title: string;
  subject: string;
  category: string;
  icon: string;
  description: string;
  level: Level;
  levelRange: { from: Level; to: Level };
  estimatedHours: number;
  prerequisites: string[];
  learningObjectives: string[];
  tags: string[];
  modules: OutlineModule[];
  /** Set for duration-based packs (from the duration planner). */
  plan?: Omit<Plan, 'days'> & { days: (Omit<PlanDay, 'topicIds'> & { topicKeys: string[] })[] };
  careerPaths?: { title: string; relevance: string }[];
};

export type OutlineTopic = {
  key: string;
  title: string;
  summary: string;
  difficulty: Level;
  kind?: TopicKind;
  priority?: (typeof PRIORITIES)[number];
  estimatedMinutes?: number;
  dayNumber?: number;
};
export type OutlineModule = { key: string; title: string; description: string; topics: OutlineTopic[] };

// ─────────────────── JSON Schemas for structured LLM output ───────────────────
// Strict mode (OpenAI-compatible and Claude) needs every property required and no
// extra keys, and supports only a subset of keywords — so no min/max here; zod
// enforces limits after parsing.

const str = { type: 'string' } as const;
const int = { type: 'integer' } as const;
const bool = { type: 'boolean' } as const;
const arr = (items: object) => ({ type: 'array', items });
const oneOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const obj = (properties: Record<string, object>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const OUTLINE_JSON_SCHEMA = obj({
  learnable: bool,
  rejectionReason: str,
  title: str,
  subject: str,
  category: oneOf(CATEGORIES),
  icon: str,
  description: str,
  level: oneOf(LEVELS),
  levelRange: obj({ from: oneOf(LEVELS), to: oneOf(LEVELS) }),
  estimatedHours: int,
  prerequisites: arr(str),
  learningObjectives: arr(str),
  tags: arr(str),
  modules: arr(
    obj({
      key: str,
      title: str,
      description: str,
      topics: arr(
        obj({
          key: str,
          title: str,
          summary: str,
          difficulty: oneOf(LEVELS),
          kind: oneOf(TOPIC_KINDS),
          priority: oneOf(PRIORITIES),
          estimatedMinutes: int,
        }),
      ),
    }),
  ),
});

export const PLAN_JSON_SCHEMA = obj({
  depth: oneOf(DEPTHS),
  coverageStatement: str,
  outcomes: arr(str),
  notCovered: arr(str),
  careerPaths: arr(obj({ title: str, relevance: str })),
  extraTopics: arr(
    obj({
      key: str,
      title: str,
      summary: str,
      kind: oneOf(TOPIC_KINDS),
      difficulty: oneOf(LEVELS),
      moduleKey: str,
      estimatedMinutes: int,
    }),
  ),
  days: arr(obj({ dayNumber: int, title: str, focus: str, topicKeys: arr(str), estimatedMinutes: int, completionCriteria: str })),
});

export const VIDEO_PICKS_JSON_SCHEMA = obj({
  picks: arr(obj({ topicKey: str, query: str, maxMinutes: int, reason: str })),
});

const MCQ_SCHEMA = obj({ question: str, options: arr(str), correctIndex: int, explanation: str, difficulty: oneOf(LEVELS) });
const VIVA_SCHEMA = obj({ question: str, expectedAnswer: str, keyPoints: arr(str), followUp: str });

export const MODULE_JSON_SCHEMA = obj({
  summary: str,
  revisionNotes: str,
  objectives: arr(str),
  glossary: arr(obj({ term: str, definition: str })),
  topics: arr(
    obj({
      key: str,
      title: str,
      difficulty: oneOf(LEVELS),
      estimatedMinutes: int,
      objectives: arr(str),
      explanation: str,
      simpleExplanation: str,
      analogy: str,
      keyPoints: arr(str),
      examples: arr(obj({ title: str, body: str, code: str, language: str, steps: arr(str) })),
      formulas: arr(obj({ name: str, expression: str, meaning: str })),
      commonMistakes: arr(obj({ mistake: str, correction: str })),
      mcqs: arr(MCQ_SCHEMA),
      viva: arr(VIVA_SCHEMA),
      practice: arr(obj({ type: oneOf(PRACTICE_TYPES), prompt: str, hints: arr(str), solution: str, answerKeywords: arr(str) })),
      flashcards: arr(obj({ front: str, back: str })),
      summary: str,
      keywords: arr(str),
    }),
  ),
});

export const QUESTIONS_JSON_SCHEMA = obj({ mcqs: arr(MCQ_SCHEMA), viva: arr(VIVA_SCHEMA) });

// ─────────────────── Validation of what the model actually returned ───────────────────

/** Over-long model text is truncated rather than failing the whole reply. */
const text = (max: number, min = 0) => z.string().trim().min(min).transform((s) => s.slice(0, max));
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));
const lvl = z.enum(LEVELS).catch('beginner');

export const OutlineReply = z.object({
  learnable: z.boolean(),
  rejectionReason: z.string().catch(''),
  title: text(120, 1),
  subject: text(120, 1),
  category: z.enum(CATEGORIES).catch('other'),
  icon: z.string().trim().catch('📘').transform((s) => (s && s.length <= 8 ? s : '📘')),
  description: text(600),
  level: lvl,
  levelRange: z.object({ from: lvl, to: lvl }),
  estimatedHours: z.number().int().catch(5).transform((n) => Math.min(200, Math.max(1, n))),
  prerequisites: list(text(200), 10),
  learningObjectives: list(text(300), 12),
  tags: list(text(40), 10),
  modules: list(
    z.object({
      key: text(80),
      title: text(150, 1),
      description: text(500),
      topics: list(
        z.object({
          key: text(80),
          title: text(150, 1),
          summary: text(400),
          difficulty: lvl,
          kind: z.enum(TOPIC_KINDS).catch('lesson'),
          priority: z.enum(PRIORITIES).catch('important'),
          estimatedMinutes: z.number().int().catch(20).transform((n) => Math.min(240, Math.max(5, n))),
        }),
        10,
      ),
    }),
    14,
  ),
});

export const PlanReply = z.object({
  depth: z.enum(DEPTHS).catch('foundation'),
  coverageStatement: text(400),
  outcomes: list(text(300), 10),
  notCovered: list(text(200), 12),
  careerPaths: list(z.object({ title: text(80, 1), relevance: text(300) }), 5),
  extraTopics: list(
    z.object({
      key: text(80),
      title: text(150, 1),
      summary: text(400),
      kind: z.enum(TOPIC_KINDS).catch('revision'),
      difficulty: lvl,
      moduleKey: text(80),
      estimatedMinutes: z.number().int().catch(30).transform((n) => Math.min(240, Math.max(5, n))),
    }),
    60,
  ),
  days: list(
    z.object({
      dayNumber: z.number().int(),
      title: text(150),
      focus: text(400),
      topicKeys: z.array(z.string()),
      estimatedMinutes: z.number().int().catch(30),
      completionCriteria: text(300),
    }),
    200,
  ),
});

export const VideoPicksReply = z.object({
  picks: list(
    z.object({
      topicKey: z.string(),
      query: text(120, 2),
      maxMinutes: z.number().int().catch(8).transform((n) => Math.min(20, Math.max(1, n))),
      reason: text(200),
    }),
    30,
  ),
});

export const ModuleReply = z.object({
  summary: z.string().trim(),
  revisionNotes: z.string().trim(),
  objectives: list(z.string().trim(), 10),
  glossary: list(z.object({ term: text(120), definition: text(600) }), 30),
  topics: z.array(
    z.object({
      key: text(80),
      title: text(150, 1),
      difficulty: lvl,
      estimatedMinutes: z.number().int().catch(15).transform((n) => Math.min(240, Math.max(3, n))),
      objectives: list(z.string().trim(), 8),
      explanation: z.string().trim().min(1),
      simpleExplanation: z.string().trim(),
      analogy: z.string().trim(),
      keyPoints: list(z.string().trim(), 12),
      examples: list(
        z.object({ title: z.string().trim(), body: z.string().trim(), code: z.string(), language: z.string().trim(), steps: z.array(z.string().trim()) }),
        6,
      ),
      formulas: list(z.object({ name: z.string().trim(), expression: z.string().trim(), meaning: z.string().trim() }), 12),
      commonMistakes: list(z.object({ mistake: z.string().trim(), correction: z.string().trim() }), 8),
      mcqs: z.array(z.unknown()),
      viva: z.array(z.unknown()),
      practice: z.array(z.unknown()),
      flashcards: z.array(z.unknown()),
      summary: z.string().trim(),
      keywords: list(text(60), 20),
    }),
  ),
});

const McqReply = z
  .object({
    question: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(2).max(6),
    correctIndex: z.number().int(),
    explanation: z.string().trim(),
    difficulty: lvl,
  })
  .refine((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length && new Set(q.options).size === q.options.length);
const VivaReply = z.object({
  question: z.string().trim().min(1),
  expectedAnswer: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).min(1).max(8),
  followUp: z.string().trim(),
});
const PracticeReply = z.object({
  type: z.enum(PRACTICE_TYPES).catch('written'),
  prompt: z.string().trim().min(1),
  hints: z.array(z.string().trim()).max(5),
  solution: z.string().trim().min(1),
  answerKeywords: z.array(z.string().trim()).max(12),
});
const FlashcardReply = z.object({ front: z.string().trim().min(1), back: z.string().trim().min(1) });

/**
 * Keeps only the questions that are internally consistent (e.g. correctIndex
 * points at a real, distinct option). One bad MCQ shouldn't cost a whole module.
 */
function keepValid<T>(schema: z.ZodType<T>, items: unknown[], max: number): T[] {
  const out: T[] = [];
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= max) break;
  }
  return out;
}

export const sanitizeQuestions = {
  mcqs: (items: unknown[], max = 8) => keepValid(McqReply, items, max),
  viva: (items: unknown[], max = 6) => keepValid(VivaReply, items, max),
  practice: (items: unknown[], max = 5) => keepValid(PracticeReply, items, max),
  flashcards: (items: unknown[], max = 10) => keepValid(FlashcardReply, items, max),
};

/** 'Longest Valid Parentheses!' → 'longest-valid-parentheses'. Used for stable module/topic ids. */
export function slugify(s: string, max = 60): string {
  const slug = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return slug || 'item';
}
