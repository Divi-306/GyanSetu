/**
 * Learning pack format, schemaVersion 2 or 3. Mirrors backend/src/modules/learningPacks/pack.schema.ts.
 * Kept as plain types (no React Native imports) so the tutor engine can run anywhere.
 * v3 adds an optional day plan, topic kinds and videos; v2 packs simply lack them.
 */

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type TopicKind = 'lesson' | 'practice' | 'project' | 'revision' | 'assessment';
export type Depth = 'foundation' | 'intermediate' | 'advanced' | 'professional';

export type Video = {
  id: string;
  topicId: string;
  title: string;
  description: string;
  durationSec: number | null;
  source: 'wikimedia' | 'youtube' | 'user';
  url: string;
  downloadUrl: string | null;
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
  id: string;
  type: 'coding' | 'numerical' | 'written' | 'debugging' | 'diagram';
  prompt: string;
  hints: string[];
  solution: string;
  answerKeywords: string[];
};
export type Flashcard = { id: string; front: string; back: string };

export type ItemKind = 'mcq' | 'viva' | 'practice' | 'flashcard';
export type Item =
  | { kind: 'mcq'; topicId: string; data: Mcq }
  | { kind: 'viva'; topicId: string; data: Viva }
  | { kind: 'practice'; topicId: string; data: Practice }
  | { kind: 'flashcard'; topicId: string; data: Flashcard };

export type Example = { title: string; body: string; code: string; language: string; steps: string[] };

export type Topic = {
  id: string;
  key: string;
  position: number;
  kind?: TopicKind;
  dayNumber?: number | null;
  title: string;
  difficulty: Level;
  estimatedMinutes: number;
  objectives: string[];
  explanation: string;
  simpleExplanation: string;
  analogy: string;
  keyPoints: string[];
  examples: Example[];
  formulas: { name: string; expression: string; meaning: string }[];
  commonMistakes: { mistake: string; correction: string }[];
  mcqs: Mcq[];
  viva: Viva[];
  practice: Practice[];
  flashcards: Flashcard[];
  summary: string;
  keywords: string[];
  videos?: Video[];
};

/** A topic as stored locally: content without the question bank and videos (those have their own tables). */
export type TopicContent = Omit<Topic, 'mcqs' | 'viva' | 'practice' | 'flashcards' | 'videos'>;

export type Module = {
  id: string;
  key: string;
  position: number;
  title: string;
  description: string;
  objectives: string[];
  summary: string;
  revisionNotes: string;
  topics: Topic[];
};

export type LearningPackContent = {
  schemaVersion: 2 | 3;
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
  plan?: Plan | null;
  careerPaths?: { title: string; relevance: string }[];
  modules: Module[];
  glossary: { term: string; definition: string; moduleId: string }[];
  migration: { fromVersion: number; removedTopicIds: string[] } | null;
};

export type Chunk = { id: number; topicId: string | null; field: string; label: string; text: string };

/** What the tutor knows about the student, read from local progress. */
export type TopicState = {
  topicId: string;
  completed: boolean;
  bookmarked: boolean;
  timeSpentSec: number;
  attempts: number;
  /** Mean score of the most recent answers (0..1), null with no attempts. */
  recentAccuracy: number | null;
};

export type TutorReply = {
  text: string; // markdown
  quickReplies: string[];
  /** True when the reply is drawn from the pack (or progress), false for "I don't know". */
  grounded: boolean;
  sources: string[];
  topicId?: string;
};
