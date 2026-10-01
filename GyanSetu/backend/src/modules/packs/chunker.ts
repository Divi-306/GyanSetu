/** Splits lesson markdown into ~900-character, paragraph-aligned chunks for AI retrieval. */
export function chunkMarkdown(md: string, maxChars = 900): string[] {
  const paragraphs = md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > maxChars) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${p}` : p;
  }
  if (current) chunks.push(current);
  return chunks;
}
