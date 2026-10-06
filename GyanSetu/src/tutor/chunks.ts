import { terms } from './text';
import type { Chunk, LearningPackContent } from './types';

const MAX_CHARS = 700;

/**
 * Splits lesson markdown into paragraph-aligned pieces of about MAX_CHARS. A
 * heading stays with the text under it and a code block with the sentence that
 * introduces it, so a retrieved piece reads on its own.
 */
export function splitMarkdown(md: string): string[] {
  const blocks: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let buf: string[] = [];
  let inCode = false;
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) blocks.push(text);
    buf = [];
  };
  for (const line of lines) {
    if (line.trim().startsWith('```')) inCode = !inCode;
    if (!inCode && line.trim() === '') flush();
    else buf.push(line);
  }
  flush();

  const out: string[] = [];
  let cur = '';
  for (const b of blocks) {
    const headingOnly = /^#{1,6}\s[^\n]*$/.test(cur);
    // A new heading starts a new piece; otherwise split when too long (never before a code block).
    const startsSection = /^#{1,6}\s/.test(b);
    if (cur && !headingOnly && (startsSection || (cur.length + b.length > MAX_CHARS && !b.startsWith('```')))) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Retrieval units for the offline tutor, in teaching order per topic (so "tell
 * me more" walks through a topic naturally).
 */
export function buildChunks(pack: LearningPackContent): Omit<Chunk, 'id'>[] {
  const out: Omit<Chunk, 'id'>[] = [];
  for (const m of pack.modules) {
    for (const t of m.topics) {
      const label = `${m.title} › ${t.title}`;
      const add = (field: string, text: string) => {
        if (text.trim()) out.push({ topicId: t.id, field, label, text: text.trim() });
      };
      add('title', `**${t.title}** — ${t.summary}${t.keywords.length ? `\n\n*Also known as / related:* ${t.keywords.join(', ')}` : ''}`);
      for (const piece of splitMarkdown(t.explanation)) add('explanation', piece);
      add('simple', `${t.simpleExplanation}${t.analogy ? `\n\n**Think of it like this:** ${t.analogy}` : ''}`);
      if (t.keyPoints.length) add('keypoints', `**Key points — ${t.title}**\n${t.keyPoints.map((k) => `- ${k}`).join('\n')}`);
      for (const f of t.formulas) add('formula', `**${f.name}:** \`${f.expression}\` — ${f.meaning}`);
      for (const e of t.examples) {
        add('example', `**Example: ${e.title}**\n\n${e.body}${e.code ? `\n\n\`\`\`${e.language}\n${e.code}\n\`\`\`` : ''}${e.steps.length ? `\n\n${e.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}`);
      }
      if (t.commonMistakes.length) {
        add('mistakes', `**Common mistakes — ${t.title}**\n${t.commonMistakes.map((c) => `- ❌ ${c.mistake} → ✅ ${c.correction}`).join('\n')}`);
      }
    }

    // Glossary terms attach to the topic that names them, so a definition question focuses that topic.
    for (const g of pack.glossary.filter((x) => x.moduleId === m.id)) {
      const termWords = terms(g.term);
      const owner = m.topics.find((t) => {
        const words = new Set([...terms(t.title), ...t.keywords.flatMap(terms)]);
        return termWords.length > 0 && termWords.every((w) => words.has(w));
      });
      out.push({ topicId: owner?.id ?? null, field: 'glossary', label: `${m.title} › Glossary`, text: `**${g.term}:** ${g.definition}` });
    }
  }
  return out;
}
