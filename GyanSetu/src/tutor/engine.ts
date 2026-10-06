import { NO, REVEAL, YES, parseChoice, parseIntent, type Intent } from './intents';
import { MODULE_ICON, formatDuration, isStrong, isWeak, moduleStatuses, percentComplete } from './progress';
import { PackIndex } from './retrieval';
import { coverage, terms, unique } from './text';
import type { Chunk, Item, ItemKind, Mcq, Practice, TopicContent, TopicState, TutorReply, Viva, Flashcard } from './types';

/**
 * OfflineTutor: teaches from a downloaded learning pack with no internet and no
 * language model. Every sentence it says comes from the pack or from the
 * student's own progress, so it cannot hallucinate; when the pack doesn't cover
 * something it says so.
 *
 * It behaves like a tutor rather than a search box: it keeps a conversation focus
 * ("give an example" means the topic just discussed), runs quizzes, vivas,
 * practice and flashcards as multi-turn activities, grades answers, records
 * them, and chooses questions adaptively (unseen and previously-wrong first,
 * weak topics weighted up).
 */

export const NOT_IN_PACK = "I don't have enough information in your offline learning pack to answer that accurately.";

export type TutorModule = { id: string; position: number; title: string; summary: string; revisionNotes: string; topicIds: string[] };
export type TutorTopic = TopicContent & { moduleId: string };

export type TutorDay = { dayNumber: number; title: string; focus: string; topicIds: string[]; estimatedMinutes: number; completionCriteria: string };

/** The pack's static content, loaded once when the tutor opens. */
export type TutorData = {
  packId: string;
  version: number;
  title: string;
  /** Day plan of a duration-based pack; empty for packs without one. */
  days?: TutorDay[];
  modules: TutorModule[];
  topics: TutorTopic[]; // in pack order
  chunks: Chunk[];
};

/** Progress and persistence. Implemented on SQLite by the app, in memory by tests. */
export interface TutorStore {
  items(topicIds: string[], kind: ItemKind): Promise<Item[]>;
  topicStates(): Promise<Map<string, TopicState>>;
  /** itemId → whether the latest answer to it was correct. */
  lastAnswers(topicIds: string[]): Promise<Map<string, boolean>>;
  currentTopicId(): Promise<string | null>;
  setCurrentTopic(topicId: string): Promise<void>;
  completeTopic(topicId: string): Promise<void>;
  recordAnswer(a: { topicId: string; itemId: string; kind: ItemKind; correct: boolean; score: number; response?: string }): Promise<void>;
  loadSession(): Promise<TutorSession | null>;
  saveSession(s: TutorSession): Promise<void>;
}

type QuizActivity = { kind: 'quiz'; title: string; items: { topicId: string; data: Mcq }[]; index: number; results: { topicId: string; correct: boolean }[] };
type VivaActivity = { kind: 'viva'; items: { topicId: string; data: Viva }[]; index: number; results: { topicId: string; score: number }[] };
type PracticeActivity = { kind: 'practice'; item: { topicId: string; data: Practice }; hintIndex: number; awaitingSelfCheck: boolean };
type FlashcardActivity = { kind: 'flashcards'; items: { topicId: string; data: Flashcard }[]; index: number; revealed: boolean; known: number };
type Activity = QuizActivity | VivaActivity | PracticeActivity | FlashcardActivity;

export type TutorSession = {
  focusTopicId: string | null;
  exampleCursor: Record<string, number>;
  /** Chunks already shown per topic, so "tell me more" moves on. */
  shown: Record<string, number[]>;
  activity: Activity | null;
};

const LETTERS = 'ABCDEF';

/**
 * During an activity, is this a new command (pause the activity) rather than an answer?
 * Long or multi-line input is always an answer: code and explanations can contain
 * words like "test" or "example".
 */
const isCommand = (input: string, intent: Intent) =>
  intent.type !== 'question' && input.length <= 60 && !input.includes('\n');
const reply = (text: string, quickReplies: string[] = [], extra: Partial<TutorReply> = {}): TutorReply => ({
  text, quickReplies, grounded: true, sources: [], ...extra,
});
const pct = (x: number) => `${Math.round(100 * x)}%`;
const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export class OfflineTutor {
  private index: PackIndex;
  private topicById: Map<string, TutorTopic>;
  private moduleById: Map<string, TutorModule>;

  constructor(private data: TutorData, private store: TutorStore) {
    this.index = new PackIndex(data.chunks, data.topics);
    this.topicById = new Map(data.topics.map((t) => [t.id, t]));
    this.moduleById = new Map(data.modules.map((m) => [m.id, m]));
  }

  // ─────────────────────────── Entry points ───────────────────────────

  /** Greeting when the tutor opens: where the student is and what they can do. */
  async greet(): Promise<TutorReply> {
    const s = await this.session();
    const current = await this.currentTopic();
    const states = await this.store.topicStates();
    const percent = percentComplete(this.data.topics.map((t) => t.id), states);
    s.focusTopicId = current.id;
    await this.store.saveSession(s);
    const module = this.moduleById.get(current.moduleId)!;
    const resuming = percent > 0 || states.get(current.id)?.timeSpentSec;
    const day = this.dayOf(current.id);
    const where = day ? `Day ${day.dayNumber} of ${this.data.days!.length}: ${day.title}` : `Module ${module.position}: ${module.title}`;
    return reply(
      `${resuming ? 'Welcome back!' : `Welcome to **${this.data.title}**!`} You're on **${current.title}** ` +
        `(${where}) — ${percent}% of the pack done.\n\n` +
        'Ask me anything from this pack, or try: *explain this*, *explain simply*, *give an example*, *quiz me*, ' +
        '*take my viva*, *practice*, *revise*, *what am I weak at?*, *next topic*.',
      ['Explain this', 'Quiz me', 'What am I weak at?', 'Next topic'],
      { topicId: current.id },
    );
  }

  async reply(input: string): Promise<TutorReply> {
    const s = await this.session();
    const intent = parseIntent(input);
    let out: TutorReply | null = null;
    if (s.activity) out = await this.continueActivity(s, input, intent);
    if (!out) out = await this.handle(s, intent);
    await this.store.saveSession(s);
    return out;
  }

  /**
   * True for an open question with no activity running ("why does TCP need a
   * handshake?"): the app may send it to the online tutor when connected.
   * Commands, quizzes, vivas and topic lessons always stay here, so answers are
   * recorded locally either way.
   */
  async isOpenQuestion(input: string): Promise<boolean> {
    if ((await this.session()).activity) return false;
    const intent = parseIntent(input);
    if (intent.type === 'question') return true;
    if (intent.type === 'explain' && terms(intent.target).length > 0) return !this.index.findTopic(intent.target)?.exactTitle;
    return false;
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private async session(): Promise<TutorSession> {
    return (await this.store.loadSession()) ?? { focusTopicId: null, exampleCursor: {}, shown: {}, activity: null };
  }

  private async currentTopic(): Promise<TutorTopic> {
    const id = await this.store.currentTopicId();
    return (id && this.topicById.get(id)) || this.data.topics[0];
  }

  private async focusTopic(s: TutorSession): Promise<TutorTopic> {
    return (s.focusTopicId && this.topicById.get(s.focusTopicId)) || (await this.currentTopic());
  }

  private moduleOf(t: TutorTopic) {
    return this.moduleById.get(t.moduleId)!;
  }

  private dayOf(topicId: string): TutorDay | undefined {
    return this.data.days?.find((d) => d.topicIds.includes(topicId));
  }

  private dayTopics(n: number): string[] {
    return this.data.days?.find((d) => d.dayNumber === n)?.topicIds ?? [];
  }

  private label(t: TutorTopic) {
    return `${this.moduleOf(t).title} › ${t.title}`;
  }

  /**
   * The topic a command is about. No target → the topic in focus. A target the
   * pack doesn't cover → 'unknown' (callers say so rather than guess).
   */
  private async resolveTopic(s: TutorSession, target: string): Promise<TutorTopic | 'unknown'> {
    if (terms(target).length === 0) return this.focusTopic(s);
    const match = this.index.findTopic(target);
    return match ? this.topicById.get(match.topicId)! : 'unknown';
  }

  private notFound(what: string): TutorReply {
    const q = unique(terms(what));
    const near = this.data.topics
      .map((t) => ({ t, c: coverage(q, new Set([...terms(t.title), ...t.keywords.flatMap(terms)])) }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c)
      .slice(0, 3)
      .map((x) => x.t.title);
    return reply(
      `${NOT_IN_PACK}\n\n` +
        (near.length ? `Related topics I *can* teach: ${near.map((n) => `**${n}**`).join(', ')}.\n\n` : '') +
        'When you are online, the online tutor can answer questions beyond this pack.',
      near.length ? near.map((n) => `Explain ${n}`) : ['What can you do?'],
      { grounded: false },
    );
  }

  /** Items for some topics, in teaching order: never answered first, then answered wrong, then right. */
  private async pickItems<K extends ItemKind>(topicIds: string[], kind: K, n: number) {
    const items = (await this.store.items(topicIds, kind)) as Extract<Item, { kind: K }>[];
    const last = await this.store.lastAnswers(topicIds);
    const rank = (id: string) => (!last.has(id) ? 0 : last.get(id) ? 2 : 1);
    return shuffle(items)
      .sort((a, b) => rank(a.data.id) - rank(b.data.id))
      .slice(0, n);
  }

  // ─────────────────────────── Commands ───────────────────────────

  private async handle(s: TutorSession, intent: Intent): Promise<TutorReply> {
    switch (intent.type) {
      case 'help':
        return this.help();
      case 'stop':
      case 'skip':
      case 'hint':
      case 'solution':
        return reply("There's nothing running right now. Want to start something?", ['Quiz me', 'Take my viva', 'Practice']);
      case 'more':
        return this.more(s);
      case 'next':
        return this.step(s, +1);
      case 'back':
        return this.step(s, -1);
      case 'goto': {
        const t = terms(intent.target).length ? await this.resolveTopic(s, intent.target) : await this.currentTopic();
        if (t === 'unknown') return this.notFound(intent.target);
        await this.store.setCurrentTopic(t.id);
        s.focusTopicId = t.id;
        return this.intro(t);
      }
      case 'learned':
        return this.learned();
      case 'weak':
        return this.weak();
      case 'today':
        return this.dayPlan((this.dayOf((await this.currentTopic()).id) ?? this.data.days?.[0])?.dayNumber);
      case 'day':
        return this.dayPlan(intent.dayNumber);
      case 'test': {
        if (intent.dayNumber && this.dayTopics(intent.dayNumber).length) {
          return this.startQuiz(s, this.dayTopics(intent.dayNumber), `Day ${intent.dayNumber} test`, 10);
        }
        if (intent.moduleNumber) return this.startQuiz(s, this.moduleTopics(intent.moduleNumber), `Module ${intent.moduleNumber} test`, 10);
        if (terms(intent.target).length) {
          const t = await this.resolveTopic(s, intent.target);
          if (t === 'unknown') return this.notFound(intent.target);
          return this.startQuiz(s, [t.id], `Test: ${t.title}`, 8);
        }
        return this.startTest(s);
      }
      case 'quiz': {
        if (intent.dayNumber && this.dayTopics(intent.dayNumber).length) {
          return this.startQuiz(s, this.dayTopics(intent.dayNumber), `Day ${intent.dayNumber} quiz`, 5);
        }
        if (intent.moduleNumber) return this.startQuiz(s, this.moduleTopics(intent.moduleNumber), `Module ${intent.moduleNumber} quiz`, 5);
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        // "Give me a question" → one; "quiz me" → five.
        const one = /\b(a|one) question\b/.test(intent.raw.toLowerCase());
        return this.startQuiz(s, [t.id], `Quiz: ${t.title}`, one ? 1 : 5);
      }
      case 'viva': {
        const ids = intent.moduleNumber ? this.moduleTopics(intent.moduleNumber) : null;
        if (ids) return this.startViva(s, ids, `Module ${intent.moduleNumber}`);
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        return this.startViva(s, [t.id], t.title);
      }
      case 'practice': {
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        return this.startPractice(s, t);
      }
      case 'flashcards': {
        if (/\bweak\b/.test(intent.raw.toLowerCase())) {
          const states = await this.store.topicStates();
          const weak = this.data.topics.filter((t) => isWeak(states.get(t.id))).map((t) => t.id);
          if (weak.length) return this.startFlashcards(s, weak, 'your weak topics');
        }
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        return this.startFlashcards(s, [t.id], t.title);
      }
      case 'summarize_module':
        return this.summarizeModule(s, intent.moduleNumber);
      case 'revise': {
        if (intent.moduleNumber) return this.summarizeModule(s, intent.moduleNumber);
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        s.focusTopicId = t.id;
        return this.revise(t);
      }
      case 'simple': {
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        s.focusTopicId = t.id;
        return this.explainSimply(t);
      }
      case 'example': {
        const t = await this.resolveTopic(s, intent.target);
        if (t === 'unknown') return this.notFound(intent.target);
        s.focusTopicId = t.id;
        return this.example(s, t);
      }
      case 'explain': {
        if (terms(intent.target).length === 0) {
          const t = await this.focusTopic(s);
          return this.explain(s, t);
        }
        const match = this.index.findTopic(intent.target);
        // "Explain subnetting" names a topic → the full lesson. "What is a subnet mask?" → the specific answer.
        if (match?.exactTitle) return this.explain(s, this.topicById.get(match.topicId)!);
        return this.answer(s, intent.raw);
      }
      case 'question':
        return this.answer(s, intent.raw);
    }
  }

  /** "What's today's plan?" / "What's on day 8?" */
  private async dayPlan(n: number | undefined): Promise<TutorReply> {
    const days = this.data.days ?? [];
    if (days.length === 0) return reply("This pack doesn't have a day plan — it's organised by modules. Try *summarize this module*.", ['Summarize this module']);
    const day = days.find((d) => d.dayNumber === n);
    if (!day) return reply(`This plan has ${days.length} days. Which one?`, [`What's on day 1?`, `What's on day ${days.length}?`], { grounded: false });
    const states = await this.store.topicStates();
    const list = day.topicIds
      .map((id) => this.topicById.get(id))
      .filter((t): t is TutorTopic => !!t)
      .map((t) => `- ${states.get(t.id)?.completed ? '✅' : '▫️'} ${t.title}`);
    const next = day.topicIds.map((id) => this.topicById.get(id)).find((t) => t && !states.get(t.id)?.completed);
    return reply(
      `### Day ${day.dayNumber} of ${days.length}: ${day.title}\n` +
        (day.focus ? `${day.focus}\n\n` : '\n') +
        `**Topics** (~${day.estimatedMinutes} min)\n${list.join('\n')}\n\n**Done when:** ${day.completionCriteria}`,
      next ? [`Go to ${next.title}`, `Quiz me on day ${day.dayNumber}`] : [`Quiz me on day ${day.dayNumber}`, `What's on day ${Math.min(days.length, day.dayNumber + 1)}?`],
      { topicId: next?.id },
    );
  }

  private help(): TutorReply {
    return reply(
      `I'm your offline tutor for **${this.data.title}**. I teach only from this downloaded pack, so I never make things up.\n\n` +
        '**Learn:** *explain this*, *explain simply*, *give an example*, *tell me more*, or ask any question.\n' +
        '**Practise:** *quiz me*, *give me a test*, *take my viva*, *practice*, *flashcards*.\n' +
        '**Review:** *revise this topic*, *summarize this module*, *what have I learned?*, *what am I weak at?*\n' +
        (this.data.days?.length ? "**Plan:** *what's today's plan?*, *what's on day 5?*, *quiz me on day 3*.\n" : '') +
        '**Move:** *next topic*, *go back*, *go to <topic>*.',
      ['Explain this', 'Quiz me', 'Take my viva', 'What have I learned?'],
    );
  }

  private intro(t: TutorTopic): TutorReply {
    const m = this.moduleOf(t);
    const objectives = t.objectives.length ? `**You'll learn to:**\n${t.objectives.map((o) => `- ${o}`).join('\n')}\n\n` : '';
    const opener = t.simpleExplanation || t.summary;
    return reply(
      `### 📘 ${t.title}\n*Module ${m.position}: ${m.title} · ${t.difficulty} · ~${t.estimatedMinutes} min*\n\n${objectives}${opener}`,
      ['Explain this', 'Give an example', 'Quiz me on this', 'Next topic'],
      { topicId: t.id, sources: [this.label(t)] },
    );
  }

  /** Notes that adapt the lesson to the student: weak here before, or jumping ahead. */
  private async pitchNote(t: TutorTopic): Promise<string> {
    const states = await this.store.topicStates();
    const st = states.get(t.id);
    if (isWeak(st)) return `> You found this one tricky before (${pct(st!.recentAccuracy!)} in recent answers), so let's take it step by step.\n\n`;
    const current = await this.currentTopic();
    const ahead = this.moduleOf(t).position > this.moduleOf(current).position + 1;
    if (ahead) {
      const before = this.data.modules[this.moduleOf(t).position - 2];
      return `> Heads-up: this is in Module ${this.moduleOf(t).position}; you're on Module ${this.moduleOf(current).position}. It builds on **${before.title}**.\n\n`;
    }
    return '';
  }

  private async explain(s: TutorSession, t: TutorTopic): Promise<TutorReply> {
    s.focusTopicId = t.id;
    const note = await this.pitchNote(t);
    const weakFirst = note.includes('tricky') && t.simpleExplanation ? `**In simple words:** ${t.simpleExplanation}\n\n` : '';
    const keyPoints = t.keyPoints.length ? `\n\n**Key points**\n${t.keyPoints.map((k) => `- ${k}`).join('\n')}` : '';
    const formulas = t.formulas.length ? `\n\n**Formulas**\n${t.formulas.map((f) => `- **${f.name}:** \`${f.expression}\` — ${f.meaning}`).join('\n')}` : '';
    // The full lesson counts as shown, so "tell me more" goes to examples and mistakes next.
    s.shown[t.id] = this.data.chunks.filter((c) => c.topicId === t.id && c.field === 'explanation').map((c) => c.id);
    return reply(
      `${note}### ${t.title}\n\n${weakFirst}${t.explanation}${formulas}${keyPoints}`,
      ['Explain simply', 'Give an example', 'Quiz me on this', 'Next topic'],
      { topicId: t.id, sources: [this.label(t)] },
    );
  }

  private explainSimply(t: TutorTopic): TutorReply {
    const simple = t.simpleExplanation || t.summary || t.keyPoints.slice(0, 2).join(' ');
    if (!simple) return this.notFound(t.title);
    return reply(
      `**${t.title}, in simple words:**\n\n${simple}` + (t.analogy ? `\n\n**Think of it like this:** ${t.analogy}` : ''),
      ['Give an example', 'Explain in detail', 'Quiz me on this'],
      { topicId: t.id, sources: [this.label(t)] },
    );
  }

  private example(s: TutorSession, t: TutorTopic): TutorReply {
    if (t.examples.length === 0) {
      return reply(
        `This pack has no worked example for **${t.title}**. Here are its key points instead:\n\n${t.keyPoints.map((k) => `- ${k}`).join('\n')}`,
        ['Explain simply', 'Practice'],
        { topicId: t.id, sources: [this.label(t)] },
      );
    }
    const i = (s.exampleCursor[t.id] ?? 0) % t.examples.length;
    s.exampleCursor[t.id] = i + 1;
    const e = t.examples[i];
    const code = e.code ? `\n\n\`\`\`${e.language}\n${e.code}\n\`\`\`` : '';
    const steps = e.steps.length ? `\n\n${e.steps.map((st, k) => `${k + 1}. ${st}`).join('\n')}` : '';
    const more = t.examples.length > 1 ? ` (${i + 1} of ${t.examples.length})` : '';
    return reply(
      `**Example${more}: ${e.title}**\n\n${e.body}${code}${steps}`,
      t.examples.length > 1 ? ['Another example', 'Practice', 'Quiz me on this'] : ['Practice', 'Quiz me on this'],
      { topicId: t.id, sources: [this.label(t)] },
    );
  }

  /** Answers a free question from the best-matching chunks of one topic. */
  private async answer(s: TutorSession, question: string): Promise<TutorReply> {
    const hits = this.index.search(question, { limit: 8 });
    const best = hits[0];
    if (!best || best.coverage < 0.5) return this.notFound(question);

    const topicId = best.chunk.topicId;
    const sameTopic = hits.filter((h) => h.chunk.topicId === topicId && h.coverage >= 0.5);
    const picked: typeof hits = [];
    for (const h of sameTopic) {
      if (picked.length >= 2) break;
      if (!picked.some((p) => p.chunk.field === h.chunk.field && p.chunk.field !== 'explanation')) picked.push(h);
    }
    if (topicId) {
      s.focusTopicId = topicId;
      s.shown[topicId] = unique([...(s.shown[topicId] ?? []), ...picked.map((p) => p.chunk.id)]);
    }
    const t = topicId ? this.topicById.get(topicId) : undefined;
    const note = t ? await this.pitchNote(t) : '';
    return reply(
      `${note}${picked.map((p) => p.chunk.text).join('\n\n')}\n\n*From your pack: ${picked[0].chunk.label}*`,
      t ? ['Tell me more', 'Explain simply', 'Give an example', 'Quiz me on this'] : ['Tell me more'],
      { topicId: topicId ?? undefined, sources: unique(picked.map((p) => p.chunk.label)), grounded: true },
    );
  }

  private async more(s: TutorSession): Promise<TutorReply> {
    const t = await this.focusTopic(s);
    const shown = new Set(s.shown[t.id] ?? []);
    const next = this.data.chunks.find((c) => c.topicId === t.id && c.field !== 'title' && !shown.has(c.id));
    if (!next) {
      return reply(`That's everything this pack has on **${t.title}**. Ready to test yourself?`, ['Quiz me on this', 'Take my viva', 'Next topic'], {
        topicId: t.id,
      });
    }
    s.shown[t.id] = [...shown, next.id];
    return reply(`${next.text}\n\n*${next.label}*`, ['Tell me more', 'Quiz me on this'], { topicId: t.id, sources: [next.label] });
  }

  private async step(s: TutorSession, dir: 1 | -1): Promise<TutorReply> {
    const current = await this.currentTopic();
    const i = this.data.topics.findIndex((t) => t.id === current.id);
    const target = this.data.topics[i + dir];
    if (!target) {
      return dir > 0
        ? reply(`🎉 You've reached the end of **${this.data.title}**! Take a full test to check yourself.`, ['Give me a test', 'What am I weak at?'])
        : reply("You're at the first topic already.", ['Explain this']);
    }
    let prefix = '';
    if (dir > 0) {
      await this.store.completeTopic(current.id);
      prefix = `✅ Marked **${current.title}** as done.\n\n`;
    }
    await this.store.setCurrentTopic(target.id);
    s.focusTopicId = target.id;
    const intro = this.intro(target);
    return { ...intro, text: prefix + intro.text };
  }

  private revise(t: TutorTopic): TutorReply {
    const parts = [
      `### 🔁 Revision: ${t.title}`,
      t.summary,
      t.keyPoints.length ? `**Remember**\n${t.keyPoints.map((k) => `- ${k}`).join('\n')}` : '',
      t.formulas.length ? `**Formulas**\n${t.formulas.map((f) => `- \`${f.expression}\` — ${f.name}`).join('\n')}` : '',
      t.commonMistakes.length ? `**Avoid these mistakes**\n${t.commonMistakes.map((m) => `- ❌ ${m.mistake} → ✅ ${m.correction}`).join('\n')}` : '',
    ];
    return reply(parts.filter(Boolean).join('\n\n'), ['Flashcards', 'Quiz me on this', 'Take my viva'], {
      topicId: t.id,
      sources: [this.label(t)],
    });
  }

  private moduleTopics(n: number): string[] {
    return this.data.modules.find((m) => m.position === n)?.topicIds ?? [];
  }

  private async summarizeModule(s: TutorSession, n?: number): Promise<TutorReply> {
    const m = n ? this.data.modules.find((x) => x.position === n) : this.moduleOf(await this.focusTopic(s));
    if (!m) return reply(`This pack has ${this.data.modules.length} modules. Which one?`, this.data.modules.slice(0, 4).map((x) => `Summarize module ${x.position}`), { grounded: false });
    const states = await this.store.topicStates();
    const list = m.topicIds
      .map((id) => this.topicById.get(id)!)
      .map((t) => `- ${states.get(t.id)?.completed ? '✅' : '▫️'} ${t.title}${isWeak(states.get(t.id)) ? ' ⚠️ weak' : ''}`)
      .join('\n');
    return reply(
      `### Module ${m.position}: ${m.title}\n\n${m.summary}\n\n**Topics**\n${list}\n\n${m.revisionNotes}`,
      [`Quiz me on module ${m.position}`, `Viva on module ${m.position}`, 'What am I weak at?'],
      { sources: [m.title] },
    );
  }

  private async learned(): Promise<TutorReply> {
    const states = await this.store.topicStates();
    const ids = this.data.topics.map((t) => t.id);
    const done = ids.filter((id) => states.get(id)?.completed).length;
    const current = await this.currentTopic();
    const statuses = moduleStatuses(this.data.modules, states, current.id);
    const lines = this.data.modules.map((m, i) => {
      const n = m.topicIds.filter((id) => states.get(id)?.completed).length;
      return `${MODULE_ICON[statuses[i]]} Module ${m.position}: ${m.title} (${n}/${m.topicIds.length})`;
    });
    const all = [...states.values()];
    const attempts = all.reduce((sum, st) => sum + st.attempts, 0);
    const time = all.reduce((sum, st) => sum + st.timeSpentSec, 0);
    const strong = this.data.topics.filter((t) => isStrong(states.get(t.id))).map((t) => t.title);
    return reply(
      `### Your progress in ${this.data.title}: ${percentComplete(ids, states)}%\n` +
        `${done} of ${ids.length} topics done · ${formatDuration(time)} studied · ${attempts} questions answered\n\n` +
        `${lines.join('\n')}\n\n` +
        (strong.length ? `**Strong at:** ${strong.slice(0, 5).join(', ')}\n\n` : '') +
        `**Current topic:** ${current.title}`,
      ['What am I weak at?', 'Continue learning', 'Give me a test'],
    );
  }

  private async weak(): Promise<TutorReply> {
    const states = await this.store.topicStates();
    const weak = this.data.topics
      .filter((t) => isWeak(states.get(t.id)))
      .sort((a, b) => states.get(a.id)!.recentAccuracy! - states.get(b.id)!.recentAccuracy!);
    const untested = this.data.topics.filter((t) => states.get(t.id)?.completed && !states.get(t.id)?.attempts).slice(0, 3);
    if (weak.length === 0) {
      return reply(
        'No weak topics yet — based on your answers so far, you are doing well. 👏' +
          (untested.length ? `\n\nYou completed these but haven't tested yourself: ${untested.map((t) => `**${t.title}**`).join(', ')}.` : ''),
        untested.length ? [`Quiz me on ${untested[0].title}`, 'Give me a test'] : ['Give me a test'],
      );
    }
    const lines = weak.slice(0, 6).map((t) => {
      const st = states.get(t.id)!;
      return `- **${t.title}** — ${pct(st.recentAccuracy!)} correct in your last ${Math.min(st.attempts, 6)} answers`;
    });
    return reply(
      `### Topics to work on\n${lines.join('\n')}\n\nI suggest revising **${weak[0].title}** first, then a short quiz on it.`,
      [`Revise ${weak[0].title}`, `Quiz me on ${weak[0].title}`, 'Flashcards for weak topics'],
      { topicId: weak[0].id },
    );
  }

  // ─────────────────────────── Activities ───────────────────────────

  private async startQuiz(s: TutorSession, topicIds: string[], title: string, n: number): Promise<TutorReply> {
    let items = await this.pickItems(topicIds, 'mcq', n);
    // A topic with few MCQs borrows from the rest of its module.
    if (items.length < Math.min(n, 3) && topicIds.length === 1) {
      const t = this.topicById.get(topicIds[0])!;
      const more = await this.pickItems(this.moduleOf(t).topicIds.filter((id) => id !== t.id), 'mcq', n - items.length);
      items = [...items, ...more];
    }
    if (items.length === 0) return reply(`This pack has no quiz questions for that yet.`, ['Take my viva', 'Practice'], { grounded: false });
    s.activity = { kind: 'quiz', title, items: items.map((i) => ({ topicId: i.topicId, data: i.data })), index: 0, results: [] };
    if (topicIds.length === 1) s.focusTopicId = topicIds[0];
    return this.askMcq(s.activity, `**${title}** — ${items.length} question${items.length === 1 ? '' : 's'}. Reply with the letter.\n\n`);
  }

  /** A mixed test: completed topics plus the current one, weak topics weighted up. */
  private async startTest(s: TutorSession): Promise<TutorReply> {
    const states = await this.store.topicStates();
    const current = await this.currentTopic();
    let ids = this.data.topics.filter((t) => states.get(t.id)?.completed || t.id === current.id).map((t) => t.id);
    if (ids.length < 3) ids = this.moduleOf(current).topicIds;
    const weakIds = ids.filter((id) => isWeak(states.get(id)));
    // Round-robin over topics, weak topics first and twice, so a test covers breadth but probes weaknesses.
    const pools = new Map<string, Extract<Item, { kind: 'mcq' }>[]>();
    for (const item of await this.pickItems(ids, 'mcq', 200)) {
      pools.set(item.topicId, [...(pools.get(item.topicId) ?? []), item]);
    }
    const order = [...weakIds, ...weakIds, ...shuffle(ids.filter((id) => !weakIds.includes(id)))];
    const chosen: Extract<Item, { kind: 'mcq' }>[] = [];
    for (let round = 0; chosen.length < 10 && round < 10; round++) {
      for (const id of order) {
        const next = pools.get(id)?.shift();
        if (next) chosen.push(next);
        if (chosen.length >= 10) break;
      }
    }
    if (chosen.length === 0) return reply('There are no test questions in this pack yet.', ['Take my viva'], { grounded: false });
    s.activity = { kind: 'quiz', title: 'Test', items: shuffle(chosen).map((i) => ({ topicId: i.topicId, data: i.data })), index: 0, results: [] };
    return this.askMcq(
      s.activity,
      `**Test** — ${chosen.length} questions from what you've studied${weakIds.length ? ', with extra focus on your weak topics' : ''}.\n\n`,
    );
  }

  private askMcq(a: QuizActivity, prefix = ''): TutorReply {
    const { data, topicId } = a.items[a.index];
    const t = this.topicById.get(topicId);
    const options = data.options.map((o, i) => `**${LETTERS[i]})** ${o}`).join('\n');
    return reply(
      `${prefix}**Q${a.index + 1}/${a.items.length}** ${t ? `· *${t.title}*` : ''}\n\n${data.question}\n\n${options}`,
      [...data.options.map((_, i) => LETTERS[i]), 'Skip', 'Stop'],
      { topicId },
    );
  }

  private async startViva(s: TutorSession, topicIds: string[], title: string): Promise<TutorReply> {
    let items = await this.pickItems(topicIds, 'viva', 3);
    if (items.length === 0 && topicIds.length === 1) {
      const t = this.topicById.get(topicIds[0])!;
      items = await this.pickItems(this.moduleOf(t).topicIds, 'viva', 3);
    }
    if (items.length === 0) return reply('This pack has no viva questions for that topic.', ['Quiz me', 'Practice'], { grounded: false });
    s.activity = { kind: 'viva', items: items.map((i) => ({ topicId: i.topicId, data: i.data })), index: 0, results: [] };
    if (topicIds.length === 1) s.focusTopicId = topicIds[0];
    return reply(
      `🎤 **Viva: ${title}** — ${items.length} question${items.length === 1 ? '' : 's'}. Answer in your own words, as you would to an examiner.\n\n**Q1.** ${items[0].data.question}`,
      ['Hint', "I don't know", 'Stop'],
      { topicId: items[0].topicId },
    );
  }

  private async startPractice(s: TutorSession, t: TutorTopic): Promise<TutorReply> {
    let [item] = await this.pickItems([t.id], 'practice', 1);
    if (!item) [item] = await this.pickItems(this.moduleOf(t).topicIds, 'practice', 1);
    if (!item) return reply(`This pack has no practice tasks for **${t.title}**. Try a quiz instead.`, ['Quiz me on this'], { grounded: false });
    s.activity = { kind: 'practice', item: { topicId: item.topicId, data: item.data }, hintIndex: 0, awaitingSelfCheck: false };
    s.focusTopicId = t.id;
    const p = item.data;
    return reply(
      `🛠️ **Practice (${p.type})** · *${this.topicById.get(item.topicId)?.title ?? ''}*\n\n${p.prompt}\n\nType your answer, or ask for a hint.`,
      ['Hint', 'Show solution', 'Stop'],
      { topicId: item.topicId },
    );
  }

  private async startFlashcards(s: TutorSession, topicIds: string[], title: string): Promise<TutorReply> {
    const items = await this.pickItems(topicIds, 'flashcard', 8);
    if (items.length === 0) return reply(`No flashcards for ${title} in this pack.`, ['Revise this topic'], { grounded: false });
    s.activity = { kind: 'flashcards', items: items.map((i) => ({ topicId: i.topicId, data: i.data })), index: 0, revealed: false, known: 0 };
    return reply(`🃏 **Flashcards: ${title}** (${items.length})\n\n**Card 1:** ${items[0].data.front}\n\nThink of the answer, then flip.`, ['Flip', 'Stop']);
  }

  /** Handles input while an activity runs. Returns null to let a new command take over. */
  private async continueActivity(s: TutorSession, input: string, intent: Intent): Promise<TutorReply | null> {
    const a = s.activity!;
    if (intent.type === 'stop') {
      s.activity = null;
      return this.finish(a, 'Stopped.');
    }
    switch (a.kind) {
      case 'quiz':
        return this.continueQuiz(s, a, input, intent);
      case 'viva':
        return this.continueViva(s, a, input, intent);
      case 'practice':
        return this.continuePractice(s, a, input, intent);
      case 'flashcards':
        if (isCommand(input, intent)) {
          s.activity = null;
          return null;
        }
        return this.continueFlashcards(s, a, input);
    }
  }

  private async continueQuiz(s: TutorSession, a: QuizActivity, input: string, intent: Intent): Promise<TutorReply | null> {
    const { data, topicId } = a.items[a.index];
    if (intent.type === 'hint') {
      const wrong = data.options.map((_, i) => i).filter((i) => i !== data.correctIndex);
      const out = wrong[Math.floor(Math.random() * wrong.length)];
      return reply(`💡 It's not **${LETTERS[out]}**.`, [...data.options.map((_, i) => LETTERS[i]).filter((_, i) => i !== out), 'Skip', 'Stop']);
    }
    let feedback: string;
    if (intent.type === 'skip') {
      feedback = `⏭️ Skipped. The answer was **${LETTERS[data.correctIndex]}) ${data.options[data.correctIndex]}**.`;
    } else {
      const choice = parseChoice(input, data.options);
      if (choice < 0) {
        // A different command (e.g. "explain subnetting") pauses the quiz instead of being marked wrong.
        if (isCommand(input, intent)) {
          s.activity = null;
          return null;
        }
        return reply(`Reply with ${data.options.map((_, i) => LETTERS[i]).join(', ')} — or say *skip* or *stop*.`, [
          ...data.options.map((_, i) => LETTERS[i]), 'Skip', 'Stop',
        ]);
      }
      const correct = choice === data.correctIndex;
      a.results.push({ topicId, correct });
      await this.store.recordAnswer({ topicId, itemId: data.id, kind: 'mcq', correct, score: correct ? 1 : 0, response: data.options[choice] });
      feedback = correct
        ? `✅ **Correct!** ${data.explanation}`
        : `❌ **Not quite.** The answer is **${LETTERS[data.correctIndex]}) ${data.options[data.correctIndex]}**. ${data.explanation}`;
    }
    a.index++;
    if (a.index >= a.items.length) {
      s.activity = null;
      return this.finish(a, feedback);
    }
    return this.askMcq(a, `${feedback}\n\n`);
  }

  private async continueViva(s: TutorSession, a: VivaActivity, input: string, intent: Intent): Promise<TutorReply | null> {
    const { data, topicId } = a.items[a.index];
    if (intent.type === 'hint') {
      return reply(`💡 Think about: *${data.keyPoints[0]}*`, ["I don't know", 'Stop'], { topicId });
    }
    let feedback: string;
    if (intent.type === 'skip') {
      a.results.push({ topicId, score: 0 });
      await this.store.recordAnswer({ topicId, itemId: data.id, kind: 'viva', correct: false, score: 0 });
      feedback = `No problem. A good answer:\n\n> ${data.expectedAnswer}`;
    } else {
      const said = new Set(terms(input));
      const covered = data.keyPoints.filter((k) => coverage(unique(terms(k)), said) >= 0.5);
      const missed = data.keyPoints.filter((k) => !covered.includes(k));
      const score = data.keyPoints.length ? covered.length / data.keyPoints.length : 0;
      const correct = score >= 0.6;
      a.results.push({ topicId, score });
      await this.store.recordAnswer({ topicId, itemId: data.id, kind: 'viva', correct, score, response: input.slice(0, 1000) });
      const verdict = score >= 0.8 ? '🌟 Excellent answer!' : correct ? '👍 Good answer.' : score > 0 ? '🙂 Partly there.' : "🤔 That's not quite it.";
      feedback =
        `${verdict} (${covered.length}/${data.keyPoints.length} key points)\n\n` +
        (covered.length ? `**You covered:** ${covered.join('; ')}\n` : '') +
        (missed.length ? `**You missed:** ${missed.join('; ')}\n` : '') +
        `\n**Model answer:** ${data.expectedAnswer}` +
        (correct && data.followUp ? `\n\n*Examiner might follow up:* ${data.followUp}` : '');
    }
    a.index++;
    if (a.index >= a.items.length) {
      s.activity = null;
      return this.finish(a, feedback);
    }
    const next = a.items[a.index];
    return reply(`${feedback}\n\n**Q${a.index + 1}.** ${next.data.question}`, ['Hint', "I don't know", 'Stop'], { topicId: next.topicId });
  }

  private async continuePractice(s: TutorSession, a: PracticeActivity, input: string, intent: Intent): Promise<TutorReply | null> {
    const { data, topicId } = a.item;
    if (a.awaitingSelfCheck) {
      const yes = YES.test(input.trim());
      const no = NO.test(input.trim());
      if (!yes && !no) {
        if (isCommand(input, intent)) {
          s.activity = null;
          return null;
        }
        return reply('Did you get it right? (yes / no)', ['Yes', 'No']);
      }
      s.activity = null;
      await this.store.recordAnswer({ topicId, itemId: data.id, kind: 'practice', correct: yes, score: yes ? 1 : 0 });
      return reply(yes ? '💪 Great work!' : "That's how we learn. Try explaining the solution back to yourself, then try another.", [
        'Another practice', 'Explain this', 'Next topic',
      ]);
    }
    if (intent.type === 'hint') {
      const hint = data.hints[a.hintIndex];
      if (!hint) return reply('No more hints for this one. Give it a try, or see the solution.', ['Show solution', 'Stop']);
      a.hintIndex++;
      return reply(`💡 Hint ${a.hintIndex}/${data.hints.length}: ${hint}`, a.hintIndex < data.hints.length ? ['Hint', 'Show solution'] : ['Show solution']);
    }
    if (intent.type === 'solution' || intent.type === 'skip') {
      a.awaitingSelfCheck = true;
      return reply(`**Solution**\n\n${this.formatSolution(data)}\n\nDid you get it right?`, ['Yes', 'No']);
    }
    if (isCommand(input, intent)) {
      s.activity = null;
      return null;
    }
    // An attempt: check it against the answer keywords, then show the full solution.
    const said = new Set(terms(input));
    const hit = data.answerKeywords.filter((k) => coverage(unique(terms(k)), said) >= 0.5);
    s.activity = null;
    if (data.answerKeywords.length === 0) {
      a.awaitingSelfCheck = true;
      s.activity = a;
      return reply(`Compare with the solution:\n\n${this.formatSolution(data)}\n\nDid you get it right?`, ['Yes', 'No']);
    }
    const score = hit.length / data.answerKeywords.length;
    const correct = score >= 0.6;
    await this.store.recordAnswer({ topicId, itemId: data.id, kind: 'practice', correct, score, response: input.slice(0, 2000) });
    return reply(
      `${correct ? '✅ Looks right' : score > 0 ? '🟡 Partly right' : '❌ Not yet'} — your answer covers ${hit.length} of ${data.answerKeywords.length} key ideas.` +
        `\n\n**Solution**\n\n${this.formatSolution(data)}`,
      ['Another practice', 'Explain this', 'Quiz me on this'],
      { topicId },
    );
  }

  private formatSolution(p: Practice) {
    // Code solutions are shown as code; prose as prose.
    return p.type === 'coding' || p.type === 'debugging' ? (p.solution.includes('```') ? p.solution : `\`\`\`\n${p.solution}\n\`\`\``) : p.solution;
  }

  private async continueFlashcards(s: TutorSession, a: FlashcardActivity, input: string): Promise<TutorReply> {
    const { data, topicId } = a.items[a.index];
    if (!a.revealed) {
      a.revealed = true;
      return reply(`**Answer:** ${data.back}\n\nDid you know it?`, ['Yes', 'No', 'Stop']);
    }
    const knew = YES.test(input.trim()) && !REVEAL.test(input.trim());
    if (knew) a.known++;
    await this.store.recordAnswer({ topicId, itemId: data.id, kind: 'flashcard', correct: knew, score: knew ? 1 : 0 });
    a.index++;
    a.revealed = false;
    if (a.index >= a.items.length) {
      s.activity = null;
      return this.finish(a, knew ? '👍' : '📝 Noted.');
    }
    return reply(`**Card ${a.index + 1}:** ${a.items[a.index].data.front}`, ['Flip', 'Stop']);
  }

  /** End-of-activity summary: score, and which topics to review. */
  private finish(a: Activity, lead: string): TutorReply {
    if (a.kind === 'quiz') {
      const right = a.results.filter((r) => r.correct).length;
      const total = a.results.length;
      if (total === 0) return reply(`${lead}`, ['Quiz me', 'Explain this']);
      const wrongTopics = unique(a.results.filter((r) => !r.correct).map((r) => r.topicId)).map((id) => this.topicById.get(id)?.title ?? id);
      return reply(
        `${lead}\n\n### 🏁 ${a.title} done: ${right}/${total} (${pct(right / total)})\n` +
          (wrongTopics.length ? `Review: ${wrongTopics.map((t) => `**${t}**`).join(', ')}.` : 'Perfect score! 🎉'),
        wrongTopics.length ? [`Revise ${wrongTopics[0]}`, 'What am I weak at?', 'Quiz me again'] : ['Next topic', 'Give me a test'],
      );
    }
    if (a.kind === 'viva') {
      const avg = a.results.length ? a.results.reduce((x, r) => x + r.score, 0) / a.results.length : 0;
      return reply(
        `${lead}\n\n### 🎤 Viva done: ${pct(avg)} of key points covered` +
          (avg < 0.6 ? '\nTip: revise the key points, then try again.' : '\nWell explained!'),
        ['Revise this topic', 'Take my viva again', 'Next topic'],
      );
    }
    if (a.kind === 'flashcards') {
      return reply(`${lead}\n\n### 🃏 You knew ${a.known} of ${a.items.length} cards.`, ['Flashcards again', 'Quiz me on this']);
    }
    return reply(lead, ['Practice', 'Explain this']);
  }
}
