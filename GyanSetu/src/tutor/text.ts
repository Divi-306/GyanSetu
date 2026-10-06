/**
 * Text helpers for the offline tutor: tokenising, a light English stemmer and
 * stop words. Same word rule as the server: \p{M} keeps Devanagari vowel signs.
 */

export const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{M}\p{N}+#]+/gu) ?? [];

/**
 * Light suffix stripping so "subnets", "subnetting" and "subnet" match. Applied
 * the same way to the pack and the question, so it only needs to be consistent,
 * not linguistically perfect.
 */
export function stem(w: string): string {
  if (w.length <= 4 || /\d/.test(w)) return w;
  for (const [suffix, replacement] of [
    ['ations', 'ate'], ['ation', 'ate'], ['ings', ''], ['ing', ''], ['ies', 'y'], ['sses', 'ss'],
    ['ches', 'ch'], ['shes', 'sh'], ['xes', 'x'], ['ed', ''], ['ly', ''], ['s', ''],
  ] as const) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3 && !(suffix === 's' && w.endsWith('ss'))) {
      const base = w.slice(0, -suffix.length) + replacement;
      // "running" → "runn" → "run"
      return /([b-df-hj-np-tv-z])\1$/.test(base) && suffix === 'ing' ? base.slice(0, -1) : base;
    }
  }
  return w;
}

/** Words that carry no topic meaning: question words, tutor commands, pronouns, fillers (English + Hinglish). */
export const STOP = new Set(
  `a an the and or but if of to in on at by for from with about into over under as is are was were be been being am
  do does did done have has had it its this that these those there here what which who whom whose when where why how
  can could would should will shall may might must i me my mine we us our you your he she they them their
  please pls kindly tell give show let lets let's want need know understand explain explanation describe define
  definition meaning mean means teach learn study simple simply simpler easy easier basic basically term terms word words
  example examples instance more again also just really very much many some any all one two
  quiz question questions test exam practice practise exercise problem problems viva oral revise revision recap summary
  summarize summarise topic topics module modules lesson chapter part next previous back go move start continue
  detail detailed depth full fully properly another now
  ok okay yes no not thanks thank hi hello hey sir mam maam bhai
  kya hai hain mein ka ki ke ko se aur ya bhi yeh ye woh wo kaise kyu kyun kab kaun samjhao samjha batao bataiye
  matlab aasan saral udaharan`
    .split(/\s+/)
    .filter(Boolean),
);

/** Stemmed content terms of a text, without stop words. */
export const terms = (s: string): string[] => words(s).filter((w) => !STOP.has(w)).map(stem);

export const unique = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Fraction of `needles` (stemmed) that appear in `haystack` (stemmed set). */
export function coverage(needles: string[], haystack: Set<string>): number {
  if (needles.length === 0) return 0;
  return needles.filter((n) => haystack.has(n)).length / needles.length;
}
