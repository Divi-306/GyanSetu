import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import { db, kvSet } from '@/db';
import { api } from '@/lib/api';
import { useApp } from '@/stores/appStore';
import type { StarterCourse } from './learning';
import { enqueue, flush } from './sync';

// ─────────────────────────── Pack format (schemaVersion 1) ───────────────────────────

type PackJson = {
  schemaVersion: 1;
  packId: string;
  kind: 'course' | 'starter';
  courseId: string | null;
  version: number;
  variant: 'full' | 'lite';
  courses: { id: string; title: string; subtitle: string | null; description: string | null; icon: string | null }[];
  lessons: {
    id: string; courseId: string; position: number; title: string; contentType: string;
    bodyMd: string; durationMin: number | null; mediaPath: string | null; mediaOmitted: boolean;
  }[];
  quizzes: {
    id: string; courseId: string; lessonId: string | null; title: string;
    questions: { id: string; position: number; prompt: string; options: string[]; correctIndex: number; explanation: string | null }[];
  }[];
  aiChunks: { id: string; courseId: string; lessonId: string | null; text: string; sourceLabel: string }[];
};

type Manifest = {
  packId: string;
  kind: 'course' | 'starter';
  courseId: string | null;
  version: number;
  variant: 'full' | 'lite';
  totalBytes: number;
  files: { path: string; sizeBytes: number; sha256: string; role: 'content' | 'media'; url: string }[];
};

export class PackError extends Error {
  constructor(public code: 'NOT_ENOUGH_STORAGE' | 'CHECKSUM_FAILED' | 'DOWNLOAD_FAILED', message: string) {
    super(message);
  }
}

// ─────────────────────────── Download progress (UI) ───────────────────────────

type DownloadProgress = { receivedBytes: number; totalBytes: number };

export const useDownloads = create<{
  active: Record<string, DownloadProgress>;
  set: (key: string, p: DownloadProgress | null) => void;
}>((set) => ({
  active: {},
  set: (key, p) =>
    set((s) => {
      const active = { ...s.active };
      if (p) active[key] = p;
      else delete active[key];
      return { active };
    }),
}));

// ─────────────────────────── Import into SQLite ───────────────────────────

/** Writes a verified pack's content into SQLite. Lesson/quiz UUIDs are stable, so re-imports are upserts. */
async function importPack(tx: SQLiteDatabase, pack: PackJson, dirUri: string | null) {
  for (const c of pack.courses) {
    await tx.runAsync(
      `INSERT INTO courses (id, title, subtitle, description, icon) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle,
         description = excluded.description, icon = excluded.icon`,
      c.id, c.title, c.subtitle, c.description, c.icon,
    );
  }

  const lessonIds = pack.lessons.map((l) => l.id);
  if (pack.kind === 'course') {
    // A new version may have dropped lessons/quizzes: remove what's no longer in the pack.
    const keep = JSON.stringify(lessonIds);
    await tx.runAsync('DELETE FROM lessons WHERE course_id = ? AND id NOT IN (SELECT value FROM json_each(?))', pack.courseId, keep);
    const keepQuizzes = JSON.stringify(pack.quizzes.map((q) => q.id));
    await tx.runAsync(
      `DELETE FROM quiz_questions WHERE quiz_id IN (
         SELECT id FROM quizzes WHERE course_id = ? AND id NOT IN (SELECT value FROM json_each(?)))`,
      pack.courseId,
      keepQuizzes,
    );
    await tx.runAsync('DELETE FROM quizzes WHERE course_id = ? AND id NOT IN (SELECT value FROM json_each(?))', pack.courseId, keepQuizzes);
    await tx.runAsync('DELETE FROM ai_chunks WHERE course_id = ?', pack.courseId);
  } else {
    await tx.runAsync('DELETE FROM ai_chunks WHERE lesson_id IN (SELECT value FROM json_each(?))', JSON.stringify(lessonIds));
  }

  for (const l of pack.lessons) {
    const mediaUri = l.mediaPath && dirUri ? `${dirUri.replace(/\/?$/, '/')}${l.mediaPath}` : null;
    await tx.runAsync(
      `INSERT INTO lessons (id, course_id, position, title, content_type, body_md, duration_min, media_uri, media_omitted, from_full_pack)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET course_id = excluded.course_id, position = excluded.position, title = excluded.title,
         content_type = excluded.content_type, body_md = excluded.body_md, duration_min = excluded.duration_min,
         media_uri = coalesce(excluded.media_uri, lessons.media_uri),
         media_omitted = CASE WHEN excluded.media_uri IS NOT NULL THEN 0 ELSE excluded.media_omitted END,
         from_full_pack = max(lessons.from_full_pack, excluded.from_full_pack)`,
      l.id, l.courseId, l.position, l.title, l.contentType, l.bodyMd, l.durationMin, mediaUri,
      l.mediaOmitted ? 1 : 0, pack.kind === 'course' ? 1 : 0,
    );
  }

  for (const q of pack.quizzes) {
    await tx.runAsync(
      `INSERT INTO quizzes (id, course_id, lesson_id, title) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET course_id = excluded.course_id, lesson_id = excluded.lesson_id, title = excluded.title`,
      q.id, q.courseId, q.lessonId, q.title,
    );
    await tx.runAsync('DELETE FROM quiz_questions WHERE quiz_id = ?', q.id);
    for (const qq of q.questions) {
      await tx.runAsync(
        `INSERT INTO quiz_questions (id, quiz_id, position, prompt, options_json, correct_index, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        qq.id, q.id, qq.position, qq.prompt, JSON.stringify(qq.options), qq.correctIndex, qq.explanation,
      );
    }
  }

  for (const c of pack.aiChunks) {
    await tx.runAsync(
      `INSERT INTO ai_chunks (id, course_id, lesson_id, text, source_label) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text, source_label = excluded.source_label`,
      c.id, c.courseId, c.lessonId, c.text, c.sourceLabel,
    );
  }

  if (pack.kind === 'starter') {
    const starter: StarterCourse[] = pack.courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      icon: c.icon,
      sampleLessons: pack.lessons.filter((l) => l.courseId === c.id).length,
      hasQuiz: pack.quizzes.some((q) => q.courseId === c.id),
    }));
    await tx.runAsync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'starter.courses',
      JSON.stringify(starter),
    );
  }
}

async function upsertPackRow(tx: SQLiteDatabase, key: string, p: { packId: string; version: number; variant: string; sizeBytes: number }, state: string, dirUri: string | null) {
  await tx.runAsync(
    `INSERT INTO learning_packs (pack_key, pack_id, version, variant, size_bytes, state, dir_uri, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pack_key) DO UPDATE SET pack_id = excluded.pack_id, version = excluded.version, variant = excluded.variant,
       size_bytes = excluded.size_bytes, state = excluded.state, dir_uri = excluded.dir_uri, downloaded_at = excluded.downloaded_at`,
    key, p.packId, p.version, p.variant, p.sizeBytes, state, dirUri, new Date().toISOString(),
  );
}

// ─────────────────────────── Bundled Starter Bundle ───────────────────────────

/**
 * First launch with no internet: the Starter Bundle ships inside the app
 * (assets/starter/pack.json) and is imported once.
 */
const bundledStarter = () => require('../../assets/starter/pack.json') as PackJson;

/** The starter pack currently in use: a downloaded update if there is one, else the bundled copy. */
async function loadInstalledStarter(): Promise<{ pack: PackJson; dirUri: string | null }> {
  const row = await db.getFirstAsync<{ dir_uri: string | null }>("SELECT dir_uri FROM learning_packs WHERE pack_key = 'starter'");
  if (row?.dir_uri) {
    const file = new File(new Directory(row.dir_uri), 'pack.json');
    if (file.exists) return { pack: JSON.parse(await file.text()) as PackJson, dirUri: row.dir_uri };
  }
  return { pack: bundledStarter(), dirUri: null };
}

export async function importBundledStarter() {
  const bundled = bundledStarter();
  const installed = await db.getFirstAsync<{ version: number; pack_id: string }>(
    "SELECT version, pack_id FROM learning_packs WHERE pack_key = 'starter'",
  );
  if (installed && installed.version >= bundled.version) return;
  await db.withTransactionAsync(async () => {
    await importPack(db, bundled, null);
    await upsertPackRow(db, 'starter', { packId: bundled.packId, version: bundled.version, variant: bundled.variant, sizeBytes: 0 }, 'ACTIVE', null);
  });
}

// ─────────────────────────── Catalog ───────────────────────────

type CatalogCourse = {
  id: string; title: string; subtitle: string | null; description: string | null; icon: string | null;
  lessonCount: number; packVersion: number | null; fullSizeBytes: number | null; liteSizeBytes: number | null;
};

/** GET /v1/courses → SQLite cache. Throws NetworkError when offline; callers keep showing the cache. */
export async function refreshCatalog() {
  const { courses } = await api<{ courses: CatalogCourse[] }>('/v1/courses', { auth: false });
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE courses SET in_catalog = 0');
    for (const [i, c] of courses.entries()) {
      await db.runAsync(
        `INSERT INTO courses (id, title, subtitle, description, icon, lesson_count, pack_version, full_size_bytes, lite_size_bytes, sort_order, in_catalog)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle, description = excluded.description,
           icon = excluded.icon, lesson_count = excluded.lesson_count, pack_version = excluded.pack_version,
           full_size_bytes = excluded.full_size_bytes, lite_size_bytes = excluded.lite_size_bytes,
           sort_order = excluded.sort_order, in_catalog = 1`,
        c.id, c.title, c.subtitle, c.description, c.icon, c.lessonCount, c.packVersion, c.fullSizeBytes, c.liteSizeBytes, i,
      );
    }
  });
  await kvSet('catalog.fetchedAt', new Date().toISOString());
  useApp.getState().bumpData();
}

// ─────────────────────────── Download manager ───────────────────────────

async function sha256Hex(file: File): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fileIn(dir: Directory, relPath: string): File {
  const parts = relPath.split('/');
  const name = parts.pop()!;
  let parent = dir;
  for (const p of parts) {
    parent = new Directory(parent, p);
    if (!parent.exists) parent.create({ intermediates: true });
  }
  return new File(parent, name);
}

async function downloadVerified(entry: Manifest['files'][number], dest: File): Promise<void> {
  const part = new File(dest.parentDirectory, `${dest.name}.part`);
  if (part.exists) part.delete();
  await File.downloadFileAsync(entry.url, part, { idempotent: true });
  if ((await sha256Hex(part)) !== entry.sha256) {
    part.delete();
    throw new PackError('CHECKSUM_FAILED', 'This pack needs to be re-downloaded.');
  }
  if (dest.exists) dest.delete();
  part.moveSync(dest);
}

/**
 * Downloads one pack (design doc §13.3): check space, save the manifest, fetch
 * each file to a .part, verify sha256, then import into SQLite only when every
 * file is verified. Files already verified on a previous attempt are kept.
 */
async function downloadPack(packKey: string, manifestUrl: string, auth: boolean) {
  const fetchManifest = () => api<Manifest>(manifestUrl, { auth });
  let manifest = await fetchManifest();

  // Leave 10% headroom (design doc §O).
  if (Paths.availableDiskSpace < manifest.totalBytes * 1.1) {
    throw new PackError('NOT_ENOUGH_STORAGE', 'Not enough storage on this phone for this pack. Free up some space and try again.');
  }

  const root = new Directory(Paths.document, 'packs', packKey);
  const dir = new Directory(root, `v${manifest.version}-${manifest.variant}`);
  if (!dir.exists) dir.create({ intermediates: true });
  new File(dir, 'manifest.json').write(JSON.stringify(manifest));

  const progress = useDownloads.getState();
  let received = 0;
  progress.set(packKey, { receivedBytes: 0, totalBytes: manifest.totalBytes });

  try {
    for (const entry of manifest.files) {
      const dest = fileIn(dir, entry.path);
      const alreadyVerified = dest.exists && dest.size === entry.sizeBytes && (await sha256Hex(dest)) === entry.sha256;
      if (!alreadyVerified) {
        try {
          await downloadVerified(entry, dest);
        } catch {
          // Expired link (403), dropped connection or bad checksum: fresh signed URLs, one more try.
          manifest = await fetchManifest();
          const fresh = manifest.files.find((f) => f.path === entry.path) ?? entry;
          try {
            await downloadVerified(fresh, dest);
          } catch (err) {
            if (err instanceof PackError) throw err;
            throw new PackError('DOWNLOAD_FAILED', 'Download interrupted. Your progress is kept; tap download to resume.');
          }
        }
      }
      received += entry.sizeBytes;
      progress.set(packKey, { receivedBytes: received, totalBytes: manifest.totalBytes });
    }

    const pack = JSON.parse(await new File(dir, 'pack.json').text()) as PackJson;
    await db.withTransactionAsync(async () => {
      await importPack(db, pack, dir.uri);
      await upsertPackRow(db, packKey, { packId: manifest.packId, version: manifest.version, variant: manifest.variant, sizeBytes: manifest.totalBytes }, 'ACTIVE', dir.uri);
      if (manifest.kind === 'course') {
        await enqueue(db, 'STORAGE_EVENT', {
          courseId: manifest.courseId, packVersion: manifest.version, eventType: 'downloaded', occurredAt: new Date().toISOString(),
        });
      }
    });

    // Older versions of this pack are no longer referenced.
    for (const entry of root.list()) {
      if (entry instanceof Directory && entry.uri !== dir.uri) entry.delete();
    }
    useApp.getState().bumpData();
    void flush();
  } finally {
    progress.set(packKey, null);
  }
}

/** GET /v1/courses/:id/pack → manifest → files. Requires login. */
export async function downloadCoursePack(courseId: string, variant: 'full' | 'lite') {
  const info = await api<{ manifestUrl: string }>(`/v1/courses/${courseId}/pack?variant=${variant}`);
  await downloadPack(courseId, info.manifestUrl, true);
}

/** Updates the Starter Bundle from the server when a newer version exists (public, no login). */
export async function refreshStarterPack() {
  const res = await api<{ pack: { version: number; manifestUrl: string } | null }>('/v1/starter-bundle', { auth: false });
  if (!res.pack) return;
  const installed = await db.getFirstAsync<{ version: number }>("SELECT version FROM learning_packs WHERE pack_key = 'starter'");
  if (installed && installed.version >= res.pack.version) return;
  await downloadPack('starter', res.pack.manifestUrl, false);
}

/** Deletes a course's downloaded files. Starter samples and the student's progress stay. */
export async function removeCoursePack(courseId: string) {
  const dir = new Directory(Paths.document, 'packs', courseId);
  if (dir.exists) dir.delete();
  const pack = await db.getFirstAsync<{ version: number }>('SELECT version FROM learning_packs WHERE pack_key = ?', courseId);
  const starter = await loadInstalledStarter();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM learning_packs WHERE pack_key = ?', courseId);
    await db.runAsync('DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = ?)', courseId);
    await db.runAsync('DELETE FROM quizzes WHERE course_id = ?', courseId);
    await db.runAsync('DELETE FROM ai_chunks WHERE course_id = ?', courseId);
    await db.runAsync('DELETE FROM lessons WHERE course_id = ?', courseId);
    // Put back this course's Starter Bundle samples, which stay available offline.
    await importPack(db, starter.pack, starter.dirUri);
    await enqueue(db, 'STORAGE_EVENT', {
      courseId, packVersion: pack?.version ?? null, eventType: 'deleted', occurredAt: new Date().toISOString(),
    });
  });
  useApp.getState().bumpData();
  void flush();
}
