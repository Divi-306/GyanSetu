import { pool } from '../../db/pool';

export type RetrievedChunk = {
  id: string;
  text: string;
  source_label: string;
  course_id: string;
  lesson_id: string | null;
  rank: number;
};

/**
 * Postgres full-text search, OR-ing the question's words.
 * \p{M} keeps Devanagari vowel signs (matras) inside Hindi words.
 */
export async function retrieveChunks(question: string, courseId?: string, limit = 6): Promise<RetrievedChunk[]> {
  const terms = [
    ...new Set((question.toLowerCase().match(/[\p{L}\p{M}\p{N}]{3,}/gu) ?? []).slice(0, 16)),
  ];
  if (terms.length === 0) return [];

  const { rows } = await pool.query<RetrievedChunk>(
    `SELECT c.id, c.text, c.source_label, c.course_id, c.lesson_id, ts_rank(c.search, q) AS rank
       FROM ai_knowledge_chunks c, to_tsquery('simple', $1) q
      WHERE c.search @@ q
        AND ($2::text IS NULL OR c.course_id = $2)
      ORDER BY rank DESC
      LIMIT $3`,
    [terms.join(' | '), courseId ?? null, limit],
  );
  return rows;
}
