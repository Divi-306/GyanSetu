/**
 * Maps what the student typed to a tutor action. Deterministic and offline:
 * ordered regex rules, most specific first. `target` is what the command is
 * about ("subnetting" in "explain subnetting simply"); empty means "this topic".
 */

export type IntentType =
  | 'help'
  | 'stop'
  | 'skip'
  | 'hint'
  | 'solution'
  | 'more'
  | 'next'
  | 'back'
  | 'goto'
  | 'learned'
  | 'weak'
  | 'test'
  | 'quiz'
  | 'viva'
  | 'practice'
  | 'flashcards'
  | 'today'
  | 'day'
  | 'summarize_module'
  | 'revise'
  | 'simple'
  | 'example'
  | 'explain'
  | 'question';

export type Intent = { type: IntentType; target: string; moduleNumber?: number; dayNumber?: number; raw: string };

type Rule = { type: IntentType; re: RegExp };

// Order matters: e.g. "explain simply" is 'simple', not 'explain'; "summarize this module" before "summarize".
const RULES: Rule[] = [
  { type: 'help', re: /^(help|hi|hello|hey|namaste|what can you do|commands|menu)\b[\s!?.]*$/ },
  // Whole-message only: a viva answer may well start with "End-to-end…" or "I don't know much, but…".
  { type: 'stop', re: /^(stop|quit|exit|cancel|end|finish|enough|band karo|ruko)( (the |this )?(quiz|test|viva|practice|flashcards))?[\s!.]*$/ },
  { type: 'skip', re: /^(skip|pass|next question|i don'?t know|idk|no idea|pata nahi)[\s!.]*$/ },
  { type: 'hint', re: /\b(hint|clue)\b/ },
  { type: 'solution', re: /\b(show|give|tell)( me)? (the )?(solution|answer)\b|\bi give up\b/ },
  { type: 'more', re: /^(more|tell me more|elaborate|go on|continue explaining|explain (it )?more|and\??|aur batao)[\s!?.]*$/ },
  { type: 'learned', re: /\bwhat (have|did) i (learn|learnt|learned|cover|complete)|\bmy progress\b|\bhow am i doing\b|\bwhat i('ve| have) learn/ },
  { type: 'flashcards', re: /\bflash ?cards?\b/ },
  { type: 'weak', re: /\bweak\b|\bstruggl|\bneed to (improve|work on)|\bwhat should i (focus|study|revise)\b|\bmy mistakes\b/ },
  { type: 'next', re: /^(next|next topic|move (on|ahead|to the next( topic)?)|go (to the )?next( topic)?|aage|agla)[\s!?.]*$|\bmove to the next topic\b/ },
  { type: 'back', re: /^(back|go back|previous( topic)?|prev|go to (the )?previous( topic)?|peeche)[\s!?.]*$/ },
  { type: 'today', re: /\b(today'?s? plan|plan for today|what('s| is) (on |for )?today|what should i (do|study|learn) today|today'?s? (lesson|topics?))\b/ },
  { type: 'day', re: /^(what('s| is) (on |in )?|show( me)? |open |plan for |go to )?day\s+\d{1,3}\b(\s+plan)?[\s?!.]*$|\bwhat('s| is) (on|in) day\s+\d{1,3}\b/ },
  { type: 'test', re: /\b(test|exam|mock|full quiz|module quiz)\b/ },
  { type: 'viva', re: /\b(viva|oral|interview me|ask me questions orally)\b/ },
  { type: 'practice', re: /\b(practice|practise|exercise|problem to solve|coding question|numerical|assignment)\b/ },
  { type: 'quiz', re: /\b(quiz|mcqs?|test me|question for me|give me (a |some )?questions?|ask me (a )?questions?|check my understanding)\b/ },
  { type: 'summarize_module', re: /\b(summar(y|ize|ise)|recap|overview)\b.*\bmodule\b|\bmodule\b.*\b(summar(y|ize|ise)|recap|overview)\b/ },
  { type: 'revise', re: /\b(revise|revision|recap|review|summar(y|ize|ise)|quick notes|cheat ?sheet)\b/ },
  { type: 'simple', re: /\b(simpl[ey]|simpler|easy|easier|eli5|like i'?m (5|five|a kid)|layman|in plain|basic terms|aasan|saral|samajh nahi)\b/ },
  { type: 'example', re: /\b(example|examples|instance|show me how|demonstrate|udaharan|e\.g)\b/ },
  { type: 'goto', re: /^(go to|open|start|begin|jump to|take me to|study|learn)\b|^(continue|resume)( learning| where i left off)?[\s!.]*$/ },
  { type: 'explain', re: /^(explain|teach|what is|what are|what's|define|describe|tell me about|samjhao|batao)\b|\bexplain\b/ },
];

/** Command words removed to find the target, e.g. "give me a quiz on dijkstra" → "dijkstra". */
const COMMAND_WORDS =
  /\b(please|pls|can you|could you|give me|show me|tell me|take my|take a|take|start|begin|let'?s|i want|i'?d like|ask me|on|about|for|of|the|a|an|this|that|it|topic|in simple terms|in simple words|simply|simple|explain|example|quiz|viva|practice|practise|test|flashcards?|revise|summari[sz]e|questions?|some|me|go to|open|jump to|take me to|study|learn|module|more|again|another|continue|resume|learning|in detail|in depth|detail|fully)\b/g;

export function parseIntent(input: string): Intent {
  const raw = input.trim();
  const text = raw.toLowerCase().replace(/\s+/g, ' ');
  const rule = RULES.find((r) => r.re.test(text));
  const type: IntentType = rule?.type ?? 'question';

  const moduleMatch = /\bmodule\s+(\d{1,2})\b/.exec(text);
  const dayMatch = /\bday\s+(\d{1,3})\b/.exec(text);
  const target =
    type === 'question'
      ? raw
      : text
          .replace(/\bmodule\s+\d{1,2}\b/, ' ')
          .replace(/\bday\s+\d{1,3}\b/, ' ')
          .replace(COMMAND_WORDS, ' ')
          .replace(/[^\p{L}\p{M}\p{N}+#' -]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim();

  return { type, target, moduleNumber: moduleMatch ? Number(moduleMatch[1]) : undefined, dayNumber: dayMatch ? Number(dayMatch[1]) : undefined, raw };
}

/** Reads an MCQ answer: "B", "b)", "2", "option c", or the option's text. -1 if it isn't one. */
export function parseChoice(input: string, options: string[]): number {
  const t = input.trim().toLowerCase();
  const letter = /^(?:option\s*)?\(?([a-f])\)?[.)]?$/.exec(t);
  if (letter) {
    const i = letter[1].charCodeAt(0) - 97;
    return i < options.length ? i : -1;
  }
  const num = /^(?:option\s*)?([1-6])[.)]?$/.exec(t);
  if (num) {
    const i = Number(num[1]) - 1;
    return i < options.length ? i : -1;
  }
  const exact = options.findIndex((o) => o.trim().toLowerCase() === t);
  if (exact >= 0) return exact;
  // "B) Vertices and edges" or the option text with a letter prefix
  const prefixed = /^\(?([a-f])\)?[.):\s]+(.+)$/.exec(t);
  if (prefixed) {
    const i = prefixed[1].charCodeAt(0) - 97;
    if (i < options.length) return i;
  }
  return -1;
}

export const YES = /^(y|yes|yeah|yep|haan|ha|correct|i got it|got it|right|i knew it|knew it)\b/i;
export const NO = /^(n|no|nope|nahi|wrong|i didn'?t|didn'?t|not really|i got it wrong)\b/i;
export const REVEAL = /^(show|flip|reveal|answer|turn|dikhao)\b/i;
