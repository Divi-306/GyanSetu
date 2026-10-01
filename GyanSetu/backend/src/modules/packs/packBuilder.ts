import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { pool, withTransaction } from '../../db/pool';
import { badRequest } from '../../lib/errors';
import { chunkMarkdown } from './chunker';

export type PackKind = 'course' | 'starter';
export type PackVariant = 'full' | 'lite';

export type PackManifest = {
  schemaVersion: 1;
  packId: string;
  kind: PackKind;
  courseId: string | null;
  version: number;
  variant: PackVariant;
  createdAt: string;
  totalBytes: number;
  files: { path: string; sizeBytes: number; sha256: string; role: 'content' | 'media' }[];
};

async function hashFile(p: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(p)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/** Resolves a lesson's media_key inside MEDIA_SOURCE_DIR, refusing anything that escapes it. */
function resolveMedia(mediaKey: string): string {
  const base = path.resolve(env.MEDIA_SOURCE_DIR);
  const abs = path.resolve(base, mediaKey);
  if (!abs.startsWith(base + path.sep)) throw new Error(`media_key escapes MEDIA_SOURCE_DIR: ${mediaKey}`);
  return abs;
}

/** Rebuild AI chunks for one course from its lessons' markdown. */
export async function regenerateChunks(courseId: string) {
  await withTransaction(async (db) => {
    const { rows: lessons } = await db.query(
      `SELECT l.id, l.position, l.title, l.body_md, c.title AS course_title
         FROM lessons l JOIN courses c ON c.id = l.course_id
        WHERE l.course_id = $1 ORDER BY l.position`,
      [courseId],
    );
    await db.query('DELETE FROM ai_knowledge_chunks WHERE course_id = $1', [courseId]);
    for (const l of lessons) {
      const label = `${l.course_title} › Lesson ${l.position}: ${l.title}`;
      const chunks = chunkMarkdown(l.body_md ?? '');
      for (let i = 0; i < chunks.length; i++) {
        await db.query(
          `INSERT INTO ai_knowledge_chunks (course_id, lesson_id, chunk_index, text, source_label)
           VALUES ($1, $2, $3, $4, $5)`,
          [courseId, l.id, i, chunks[i], label],
        );
      }
    }
  });
}

async function loadContent(kind: PackKind, courseId: string | null) {
  // The starter pack carries every sample lesson, including starter-only courses
  // that are deliberately unpublished from the catalog (e.g. 'programming').
  const lessonFilter = kind === 'course' ? 'l.course_id = $1' : 'l.is_sample';
  const params = kind === 'course' ? [courseId] : [];

  const { rows: lessons } = await pool.query(
    `SELECT l.*, c.sort_order FROM lessons l JOIN courses c ON c.id = l.course_id
      WHERE ${lessonFilter} ORDER BY c.sort_order, l.position`,
    params,
  );
  const courseIds = [...new Set(lessons.map((l) => l.course_id as string))];
  const lessonIds = lessons.map((l) => l.id as string);

  const { rows: courses } = await pool.query(
    `SELECT id, title, subtitle, description, icon FROM courses WHERE id = ANY($1::text[]) ORDER BY sort_order`,
    [courseIds],
  );
  const { rows: quizzes } = await pool.query(
    kind === 'course'
      ? 'SELECT * FROM quizzes WHERE course_id = $1 ORDER BY title'
      : 'SELECT * FROM quizzes WHERE is_sample AND course_id = ANY($1::text[]) ORDER BY course_id, title',
    (kind === 'course' ? params : [courseIds]) as unknown[],
  );
  const { rows: questions } = await pool.query(
    'SELECT * FROM quiz_questions WHERE quiz_id = ANY($1::uuid[]) ORDER BY quiz_id, position',
    [quizzes.map((q) => q.id)],
  );
  const { rows: chunks } = await pool.query(
    'SELECT * FROM ai_knowledge_chunks WHERE lesson_id = ANY($1::uuid[]) ORDER BY course_id, lesson_id, chunk_index',
    [lessonIds],
  );

  return { lessons, courses, quizzes, questions, chunks };
}

type Content = Awaited<ReturnType<typeof loadContent>>;

/** Writes one variant to disk. The DB row is inserted later, together with its sibling variant. */
async function writeVariant(
  kind: PackKind,
  courseId: string | null,
  version: number,
  variant: PackVariant,
  content: Content,
) {
  const packId = randomUUID();
  const rel = path.join(kind === 'starter' ? 'starter' : courseId!, `v${version}-${variant}`);
  const dir = path.resolve(env.PACK_STORAGE_DIR, rel);
  // A previous build that crashed before its DB insert may have left files here.
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, 'media'), { recursive: true });

  const files: PackManifest['files'] = [];

  const lessons = [];
  for (const l of content.lessons) {
    const includeMedia = Boolean(l.media_key) && (variant === 'full' || l.content_type !== 'video');
    let mediaPath: string | null = null;
    if (includeMedia) {
      mediaPath = `media/${l.id}${path.extname(l.media_key)}`;
      const dest = path.join(dir, mediaPath);
      await fs.copyFile(resolveMedia(l.media_key), dest);
      const stat = await fs.stat(dest);
      files.push({ path: mediaPath, sizeBytes: stat.size, sha256: await hashFile(dest), role: 'media' });
    }
    lessons.push({
      id: l.id,
      courseId: l.course_id,
      position: l.position,
      title: l.title,
      contentType: l.content_type,
      bodyMd: l.body_md ?? '',
      durationMin: l.duration_min,
      mediaPath,
      mediaOmitted: Boolean(l.media_key) && !includeMedia,
    });
  }

  const packJson = {
    schemaVersion: 1,
    packId,
    kind,
    courseId,
    version,
    variant,
    courses: content.courses,
    lessons,
    quizzes: content.quizzes.map((q) => ({
      id: q.id,
      courseId: q.course_id,
      lessonId: q.lesson_id,
      title: q.title,
      questions: content.questions
        .filter((qq) => qq.quiz_id === q.id)
        .map((qq) => ({
          id: qq.id,
          position: qq.position,
          prompt: qq.prompt,
          options: qq.options,
          correctIndex: qq.correct_index,
          explanation: qq.explanation,
        })),
    })),
    aiChunks: content.chunks.map((c) => ({
      id: c.id,
      courseId: c.course_id,
      lessonId: c.lesson_id,
      text: c.text,
      sourceLabel: c.source_label,
    })),
  };

  const packPath = path.join(dir, 'pack.json');
  await fs.writeFile(packPath, JSON.stringify(packJson));
  const packStat = await fs.stat(packPath);
  files.unshift({ path: 'pack.json', sizeBytes: packStat.size, sha256: await hashFile(packPath), role: 'content' });

  const manifest: PackManifest = {
    schemaVersion: 1,
    packId,
    kind,
    courseId,
    version,
    variant,
    createdAt: new Date().toISOString(),
    totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
    files,
  };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { manifest, storagePrefix: rel.split(path.sep).join('/') };
}

/** Builds a new version (both full and lite) of a course pack or the starter pack. */
export async function buildPacks(kind: PackKind, courseId: string | null, releaseNotes?: string) {
  if (kind === 'course') {
    await regenerateChunks(courseId!);
  } else {
    const { rows } = await pool.query(
      'SELECT DISTINCT course_id FROM lessons WHERE is_sample',
    );
    for (const r of rows) await regenerateChunks(r.course_id);
  }

  const content = await loadContent(kind, courseId);
  if (content.lessons.length === 0) {
    throw badRequest('NOTHING_TO_PUBLISH', `No lessons to pack for ${kind} ${courseId ?? ''}`.trim());
  }

  const { rows } = await pool.query<{ next_version: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM learning_packs
      WHERE kind = $1 AND course_id IS NOT DISTINCT FROM $2`,
    [kind, courseId],
  );
  const version = rows[0].next_version;

  const built: Awaited<ReturnType<typeof writeVariant>>[] = [];
  for (const variant of ['full', 'lite'] as const) {
    built.push(await writeVariant(kind, courseId, version, variant, content));
  }

  // Both variants become visible together, or neither does.
  await withTransaction(async (db) => {
    for (const { manifest: m, storagePrefix } of built) {
      await db.query(
        `INSERT INTO learning_packs (id, kind, course_id, version, variant, size_bytes, storage_prefix, manifest, release_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [m.packId, kind, courseId, version, m.variant, m.totalBytes, storagePrefix, m, releaseNotes ?? null],
      );
    }
  });
  return built.map((b) => b.manifest);
}
