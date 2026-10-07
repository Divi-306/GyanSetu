import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import { db, kvDelete, kvGet, kvSet } from '@/db';
import { ApiError, NetworkError, api, apiText, hasSession } from '@/lib/api';
import { localDay } from '@/lib/dates';
import { useApp } from '@/stores/appStore';
import { buildChunks } from '@/tutor/chunks';
import type { TutorData, TutorSession, TutorStore } from '@/tutor/engine';
import { RECENT_ANSWERS, isWeak, moduleStatuses, percentComplete, type ModuleStatus } from '@/tutor/progress';
import type { Depth, Item, ItemKind, LearningPackContent, Level, Mcq, Topic, TopicContent, TopicKind, TopicState, Video, Viva } from '@/tutor/types';
import { enqueue, flush, refreshPendingCount } from './sync';

// ═══════════════════════════ Server API ═══════════════════════════

export type RemotePack = {
  id: string;
  title: string;
  subject: string;
  description: string;
  category: string;
  level: Level;
  icon: string;
  source: 'ai' | 'course';
  durationDays: number | null;
  dailyMinutes: number | null;
  goal: string | null;
  depth: Depth | null;
  latestReadyVersion: number | null;
};

export type RemotePlan = {
  durationDays: number;
  dailyMinutes: number;
  depth: Depth;
  coverageStatement: string;
  outcomes: string[];
  notCovered: string[];
  days: { dayNumber: number; title: string; focus: string; estimatedMinutes: number; completionCriteria: string; topicKeys: string[] }[];
};

export type VersionStatus = {
  version: number;
  status: 'generating' | 'ready' | 'failed';
  modulesTotal: number;
  modulesDone: number;
  sizeBytes: number | null;
  sha256: string | null;
  topicCount: number | null;
  changeNotes: string | null;
  error: string | null;
  outline: {
    levelRange: { from: Level; to: Level };
    estimatedHours: number;
    prerequisites: string[];
    learningObjectives: string[];
    modules: {
      key: string;
      title: string;
      description: string;
      topics: { key: string; title: string; difficulty: Level; kind: TopicKind; dayNumber: number | null }[];
    }[];
    plan: RemotePlan | null;
    careerPaths: { title: string; relevance: string }[];
  };
};

export type ExplorePack = RemotePack & { moduleCount: number; topicCount: number; sizeBytes: number };

/** "Teach me <anything>": returns the outline at once; content keeps generating on the server. */
export function generatePack(input: { subject: string; level?: Level; goal?: string; durationDays?: number; dailyMinutes?: number; fresh?: boolean }) {
  return api<{ reused: boolean; pack: RemotePack; version: VersionStatus }>('/v1/learning-packs', {
    method: 'POST',
    body: input,
    timeoutMs: 100_000, // the outline is one model call
  });
}

export function getRemotePack(packId: string) {
  return api<{ pack: RemotePack; version: VersionStatus | null }>(`/v1/learning-packs/${packId}`);
}

export function explorePacks(q?: string) {
  return api<{ packs: ExplorePack[] }>(`/v1/learning-packs${q ? `?q=${encodeURIComponent(q)}` : ''}`, { auth: false });
}

export function requestNewVersion(packId: string, changeRequest?: string) {
  return api<{ version: VersionStatus }>(`/v1/learning-packs/${packId}/versions`, {
    method: 'POST',
    body: changeRequest ? { changeRequest } : {},
    timeoutMs: 100_000,
  });
}

export function retryGeneration(packId: string, version: number) {
  return api<{ version: VersionStatus }>(`/v1/learning-packs/${packId}/versions/${version}/retry`, { method: 'POST', body: {} });
}

export type OnlineTutorAnswer = {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  groundedInPack: boolean;
  topics: { topicId: string; title: string }[];
  suggestedFollowUps: string[];
  mode: 'online';
};

/** The online tutor, grounded in this pack and told where the student is. */
export async function askOnlineTutor(packId: string, question: string, history: { role: 'user' | 'tutor'; text: string }[]) {
  const progress = await getProgressSummary(packId);
  return api<OnlineTutorAnswer>(`/v1/learning-packs/${packId}/tutor`, {
    method: 'POST',
    timeoutMs: 70_000,
    body: {
      question,
      topicId: progress.currentTopicId ?? undefined,
      history: history.slice(-6).map((h) => ({ role: h.role, text: h.text.slice(0, 4000) })),
      context: {
        currentTopicId: progress.currentTopicId ?? undefined,
        completedTopicIds: progress.completedTopicIds.slice(0, 200),
        weakTopicIds: progress.weakTopicIds.slice(0, 50),
        percent: progress.percent,
      },
    },
  });
}

/**
 * Fetches fresh MCQs and viva questions for a topic (online) and adds them to the
 * local bank, so they stay available offline and survive pack updates.
 */
export async function fetchMoreQuestions(packId: string, topicId: string) {
  const wrong = await db.getAllAsync<{ response: string | null }>(
    `SELECT response FROM lp_answers WHERE pack_id = ? AND topic_id = ? AND correct = 0 AND response IS NOT NULL
      ORDER BY answered_at DESC LIMIT 5`,
    packId,
    topicId,
  );
  const res = await api<{ mcqs: Mcq[]; viva: Viva[] }>(`/v1/learning-packs/${packId}/topics/${encodeURIComponent(topicId)}/questions`, {
    method: 'POST',
    timeoutMs: 100_000,
    body: { mcqCount: 5, vivaCount: 2, weakPoints: wrong.map((w) => (w.response ?? '').slice(0, 300)) },
  });
  await db.withTransactionAsync(async () => {
    for (const q of res.mcqs) await insertItem(db, packId, topicId, 'mcq', q.id, q, 'online');
    for (const q of res.viva) await insertItem(db, packId, topicId, 'viva', q.id, q, 'online');
  });
  useApp.getState().bumpData();
  return { mcqs: res.mcqs.length, viva: res.viva.length };
}

export type Insights = {
  summary: string;
  weakTopicIds: string[];
  strongTopicIds: string[];
  misconceptions: string[];
  nextSteps: { action: string; topicId: string | null }[];
};

/** AI study plan from local progress (online). */
export async function getInsights(packId: string) {
  const states = await topicStates(packId);
  const topics = await db.getAllAsync<{ id: string }>('SELECT id FROM lp_topics WHERE pack_id = ? ORDER BY position', packId);
  const wrong = await db.getAllAsync<{ topic_id: string; response: string }>(
    `SELECT topic_id, response FROM lp_answers WHERE pack_id = ? AND correct = 0 AND response IS NOT NULL ORDER BY answered_at DESC LIMIT 60`,
    packId,
  );
  const body = {
    topics: topics.map(({ id }) => {
      const s = states.get(id);
      return {
        topicId: id,
        completed: !!s?.completed,
        attempts: s?.attempts ?? 0,
        accuracy: s?.recentAccuracy ?? null,
        timeSpentSec: s?.timeSpentSec ?? 0,
        recentWrong: wrong.filter((w) => w.topic_id === id).slice(0, 3).map((w) => w.response.slice(0, 300)),
      };
    }),
  };
  return api<Insights>(`/v1/learning-packs/${packId}/insights`, { method: 'POST', body, timeoutMs: 70_000 });
}

// ─────────────────────────── Standalone quiz generator (online) ───────────────────────────

export type QuizQuestion = {
  id: string;
  topicId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Level;
};

export type GeneratedQuiz = { subject: string; difficulty: 'easy' | 'medium' | 'hard'; topicIds: string[]; questions: QuizQuestion[] };

/** "Generate Quiz": any subject in this pack, any topic set, any difficulty/count. Not saved until saveQuizToPack(). */
export function generateQuiz(packId: string, opts: { topicIds?: string[]; difficulty: 'easy' | 'medium' | 'hard'; count: 5 | 10 | 20 }) {
  return api<GeneratedQuiz>(`/v1/learning-packs/${packId}/quiz/generate`, {
    method: 'POST',
    timeoutMs: 100_000,
    body: opts,
  });
}

// ═══════════════════════════ Download manager ═══════════════════════════

export type DownloadPhase = 'downloading' | 'verifying' | 'saving';
type DownloadState = { phase: DownloadPhase; progress: number };

/** Live download progress per pack, for the UI. */
export const usePackDownloads = create<{
  active: Record<string, DownloadState>;
  set: (packId: string, s: DownloadState | null) => void;
}>((set) => ({
  active: {},
  set: (packId, s) =>
    set((st) => {
      const active = { ...st.active };
      if (s) active[packId] = s;
      else delete active[packId];
      return { active };
    }),
}));

export class PackDownloadError extends Error {
  constructor(
    public code: 'NOT_ENOUGH_STORAGE' | 'CHECKSUM_FAILED' | 'INVALID_PACK' | 'NOT_READY' | 'DOWNLOAD_FAILED',
    message: string,
  ) {
    super(message);
  }
}

export const packDir = (packId: string) => new Directory(Paths.document, 'lpacks', packId);

/** Best-effort file removal (a file already gone is fine). */
export function deleteFileQuietly(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (err) {
    console.warn('[files] could not delete', uri, err);
  }
}

/** A pack must look like schemaVersion 2 or 3 before it touches the database. */
function validatePack(pack: LearningPackContent, packId: string, version: number) {
  const ok =
    (pack?.schemaVersion === 2 || pack?.schemaVersion === 3) &&
    pack.packId === packId &&
    pack.version === version &&
    Array.isArray(pack.modules) &&
    pack.modules.length > 0 &&
    pack.modules.every((m) => typeof m.id === 'string' && Array.isArray(m.topics) && m.topics.every((t) => typeof t.id === 'string' && typeof t.explanation === 'string'));
  const topicCount = ok ? pack.modules.reduce((n, m) => n + m.topics.length, 0) : -1;
  if (!ok || topicCount !== pack.metadata?.topicCount) {
    throw new PackDownloadError('INVALID_PACK', 'This learning pack looks damaged. Please try downloading it again.');
  }
}

async function insertItem(tx: SQLiteDatabase, packId: string, topicId: string, kind: ItemKind, id: string, data: unknown, source: 'pack' | 'online') {
  await tx.runAsync(
    `INSERT INTO lp_items (pack_id, id, topic_id, kind, payload_json, source) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(pack_id, id) DO UPDATE SET topic_id = excluded.topic_id, kind = excluded.kind,
       payload_json = excluded.payload_json, source = excluded.source`,
    packId, id, topicId, kind, JSON.stringify(data), source,
  );
}

/**
 * Writes a verified pack into SQLite, replacing its previous version's content.
 * Student progress is keyed by topic id, which stays stable across versions, so
 * it is not touched; see migrateProgress for the parts that do need care.
 */
async function importPack(tx: SQLiteDatabase, pack: LearningPackContent, meta: { sizeBytes: number; sha256: string; fileUri: string; offline: boolean }, onTopic: (i: number, n: number) => void) {
  const id = pack.packId;
  await tx.runAsync('DELETE FROM lp_modules WHERE pack_id = ?', id);
  await tx.runAsync('DELETE FROM lp_topics WHERE pack_id = ?', id);
  await tx.runAsync("DELETE FROM lp_items WHERE pack_id = ? AND source = 'pack'", id);
  await tx.runAsync('DELETE FROM lp_chunks WHERE pack_id = ?', id);
  await tx.runAsync('DELETE FROM lp_days WHERE pack_id = ?', id);

  for (const m of pack.modules) {
    await tx.runAsync(
      'INSERT INTO lp_modules (pack_id, id, position, title, description, summary, revision_notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, m.id, m.position, m.title, m.description, m.summary, m.revisionNotes,
    );
  }
  // Learning order: by day for planned packs (a day may draw on several modules), else module order.
  const ordered = pack.modules
    .flatMap((m, mi) => m.topics.map((t, ti) => ({ m, t, key: [t.dayNumber ?? 0, mi, ti] })))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  const total = pack.metadata.topicCount;
  const packVideos: Video[] = [];
  let position = 0;
  for (const { m, t } of ordered) {
    position++;
    const { mcqs, viva, practice, flashcards, videos, ...content } = t as Topic;
    await tx.runAsync(
      'INSERT INTO lp_topics (pack_id, id, module_id, position, title, difficulty, content_json, kind, day_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, t.id, m.id, position, t.title, t.difficulty, JSON.stringify(content), t.kind ?? 'lesson', t.dayNumber ?? null,
    );
    for (const q of mcqs) await insertItem(tx, id, t.id, 'mcq', q.id, q, 'pack');
    for (const q of viva) await insertItem(tx, id, t.id, 'viva', q.id, q, 'pack');
    for (const q of practice) await insertItem(tx, id, t.id, 'practice', q.id, q, 'pack');
    for (const q of flashcards) await insertItem(tx, id, t.id, 'flashcard', q.id, q, 'pack');
    packVideos.push(...(videos ?? []));
    onTopic(position, total);
  }

  for (const d of pack.plan?.days ?? []) {
    await tx.runAsync(
      `INSERT INTO lp_days (pack_id, day_number, title, focus, topic_ids_json, estimated_minutes, completion_criteria) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, d.dayNumber, d.title, d.focus, JSON.stringify(d.topicIds), d.estimatedMinutes, d.completionCriteria,
    );
  }

  // Videos: metadata follows the new version; a file already on the phone stays. Pack videos the
  // new version dropped are removed (with their files); the student's own videos are never touched.
  const now = new Date().toISOString();
  for (const v of packVideos) {
    await tx.runAsync(
      `INSERT INTO lp_videos (pack_id, id, topic_id, title, description, duration_sec, source, url, download_url, thumbnail,
          license, attribution, downloadable, size_bytes, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pack_id, id) DO UPDATE SET topic_id = excluded.topic_id, title = excluded.title, description = excluded.description,
         duration_sec = excluded.duration_sec, url = excluded.url, download_url = excluded.download_url, thumbnail = excluded.thumbnail,
         license = excluded.license, attribution = excluded.attribution, downloadable = excluded.downloadable, size_bytes = excluded.size_bytes`,
      id, v.id, v.topicId, v.title, v.description, v.durationSec, v.source, v.url, v.downloadUrl, v.thumbnail,
      v.license, v.attribution, v.downloadable ? 1 : 0, v.sizeBytes, now,
    );
  }
  const dropped = await tx.getAllAsync<{ id: string; local_uri: string | null }>(
    `SELECT id, local_uri FROM lp_videos WHERE pack_id = ? AND source <> 'user' AND id NOT IN (SELECT value FROM json_each(?))`,
    id, JSON.stringify(packVideos.map((v) => v.id)),
  );
  for (const d of dropped) {
    if (d.local_uri) deleteFileQuietly(d.local_uri);
    await tx.runAsync('DELETE FROM lp_videos WHERE pack_id = ? AND id = ?', id, d.id);
  }
  for (const c of buildChunks(pack)) {
    await tx.runAsync('INSERT INTO lp_chunks (pack_id, topic_id, field, label, text) VALUES (?, ?, ?, ?, ?)', id, c.topicId, c.field, c.label, c.text);
  }
  // Extra questions fetched online for topics that no longer exist go with them.
  await tx.runAsync('DELETE FROM lp_items WHERE pack_id = ? AND topic_id NOT IN (SELECT id FROM lp_topics WHERE pack_id = ?)', id, id);

  const plan = pack.plan ?? null;
  const planJson = plan
    ? JSON.stringify({ coverageStatement: plan.coverageStatement, outcomes: plan.outcomes, notCovered: plan.notCovered, careerPaths: pack.careerPaths ?? [] })
    : null;
  await tx.runAsync(
    `INSERT INTO lp_packs (pack_id, version, title, subject, description, category, level_from, level_to, icon, module_count,
        topic_count, estimated_minutes, size_bytes, sha256, file_uri, offline, state, latest_version, downloaded_at, last_opened_at,
        duration_days, daily_minutes, goal, depth, plan_json, optimized_at, bytes_saved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, NULL, ?, ?, ?, ?, ?, NULL, 0)
     ON CONFLICT(pack_id) DO UPDATE SET version = excluded.version, title = excluded.title, subject = excluded.subject,
       description = excluded.description, category = excluded.category, level_from = excluded.level_from,
       level_to = excluded.level_to, icon = excluded.icon, module_count = excluded.module_count,
       topic_count = excluded.topic_count, estimated_minutes = excluded.estimated_minutes, size_bytes = excluded.size_bytes,
       sha256 = excluded.sha256, file_uri = excluded.file_uri, offline = max(lp_packs.offline, excluded.offline),
       state = 'ACTIVE', latest_version = max(coalesce(lp_packs.latest_version, 0), excluded.version),
       downloaded_at = excluded.downloaded_at, duration_days = excluded.duration_days, daily_minutes = excluded.daily_minutes,
       goal = excluded.goal, depth = excluded.depth, plan_json = excluded.plan_json, optimized_at = NULL, bytes_saved = 0`,
    id, pack.version, pack.title, pack.subject, pack.description, pack.category, pack.levelRange.from, pack.levelRange.to,
    pack.icon, pack.modules.length, total, pack.metadata.estimatedMinutes, meta.sizeBytes, meta.sha256, meta.fileUri,
    meta.offline ? 1 : 0, pack.version, now, plan?.durationDays ?? null, plan?.dailyMinutes ?? null, plan?.goal ?? null,
    plan?.depth ?? null, planJson,
  );

  // Validate what landed in the database before committing.
  const stored = await tx.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM lp_topics WHERE pack_id = ?', id);
  if (stored?.n !== total) throw new PackDownloadError('INVALID_PACK', 'Saving the pack failed. Please try again.');
}

/**
 * After a version change: progress rows stay (topic ids are stable). If the topic
 * the student was on was removed, resume at the first unfinished topic instead.
 * Rows for removed topics are kept, hidden, so they come back if the topic returns.
 */
async function migrateProgress(tx: SQLiteDatabase, packId: string) {
  const p = await tx.getFirstAsync<{ current_topic_id: string | null }>('SELECT current_topic_id FROM lp_progress WHERE pack_id = ?', packId);
  if (!p?.current_topic_id) return;
  const exists = await tx.getFirstAsync('SELECT 1 FROM lp_topics WHERE pack_id = ? AND id = ?', packId, p.current_topic_id);
  if (exists) return;
  const next = await tx.getFirstAsync<{ id: string }>(
    `SELECT t.id FROM lp_topics t LEFT JOIN lp_topic_progress tp ON tp.pack_id = t.pack_id AND tp.topic_id = t.id
      WHERE t.pack_id = ? AND tp.completed_at IS NULL ORDER BY t.position LIMIT 1`,
    packId,
  );
  await setCurrentTopicTx(tx, packId, next?.id ?? null);
}

/**
 * Download → verify sha256 → check it fits → write file → import into SQLite
 * (validated, all-or-nothing) → mark available. `offline: false` caches a pack
 * for online study without pinning it ("Start Learning" without "Download").
 */
export async function downloadPack(packId: string, version: number, opts: { offline: boolean; expectedSha256?: string | null }) {
  const progress = usePackDownloads.getState();
  progress.set(packId, { phase: 'downloading', progress: 0.05 });
  try {
    let text: string;
    let headerSha: string | null;
    try {
      const res = await apiText(`/v1/learning-packs/${packId}/versions/${version}/content`, { timeoutMs: 120_000 });
      text = res.text;
      headerSha = res.headers.get('x-content-sha256');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw new PackDownloadError('NOT_READY', 'This pack is not ready to download yet.');
      if (err instanceof NetworkError) throw new PackDownloadError('DOWNLOAD_FAILED', 'Download interrupted. Check your internet and try again.');
      throw err;
    }

    progress.set(packId, { phase: 'verifying', progress: 0.35 });
    const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
    if ((headerSha && sha256 !== headerSha) || (opts.expectedSha256 && sha256 !== opts.expectedSha256)) {
      throw new PackDownloadError('CHECKSUM_FAILED', 'The download was corrupted. Please try again.');
    }
    let pack: LearningPackContent;
    try {
      pack = JSON.parse(text) as LearningPackContent;
    } catch {
      throw new PackDownloadError('INVALID_PACK', 'This learning pack looks damaged. Please try downloading it again.');
    }
    validatePack(pack, packId, version);

    const sizeBytes = text.length * 2; // upper bound for UTF-8 on disk
    // File + SQLite copy + indexes; leave generous headroom.
    if (Paths.availableDiskSpace < sizeBytes * 4) {
      throw new PackDownloadError('NOT_ENOUGH_STORAGE', 'Not enough storage on this phone for this pack. Free up some space and try again.');
    }

    progress.set(packId, { phase: 'saving', progress: 0.45 });
    const dir = packDir(packId);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `v${version}.json`);
    const part = new File(dir, `v${version}.json.part`);
    if (part.exists) part.delete();
    part.write(text);
    if (file.exists) file.delete();
    part.moveSync(file);

    await db.withTransactionAsync(async () => {
      await importPack(db, pack, { sizeBytes: file.size ?? sizeBytes, sha256, fileUri: file.uri, offline: opts.offline }, (i, n) =>
        progress.set(packId, { phase: 'saving', progress: 0.45 + 0.5 * (i / Math.max(1, n)) }),
      );
      await migrateProgress(db, packId);
      if (opts.offline) await addToLibrary(db, packId, version, pack.title, pack.icon, pack.level);
    });

    // Older version files are no longer referenced.
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.uri !== file.uri) entry.delete();
    }
    changed();
    return pack;
  } finally {
    progress.set(packId, null);
  }
}

/** "Download for offline": pins a cached pack, or downloads it first. */
export async function makeAvailableOffline(packId: string, version: number, expectedSha256?: string | null) {
  const local = await db.getFirstAsync<{ version: number; title: string; icon: string; level_from: string }>(
    "SELECT version, title, icon, level_from FROM lp_packs WHERE pack_id = ? AND state = 'ACTIVE'",
    packId,
  );
  if (local && local.version >= version) {
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE lp_packs SET offline = 1 WHERE pack_id = ?', packId);
      await addToLibrary(db, packId, local.version, local.title, local.icon, local.level_from);
    });
    changed();
    return;
  }
  await downloadPack(packId, version, { offline: true, expectedSha256 });
}

async function addToLibrary(tx: SQLiteDatabase, packId: string, version: number, title: string, icon: string, level: string) {
  const now = new Date().toISOString();
  await tx.runAsync(
    `INSERT INTO lp_library (pack_id, version, state, title, icon, level, latest_version, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
     ON CONFLICT(pack_id) DO UPDATE SET version = excluded.version, state = 'active', title = excluded.title,
       icon = excluded.icon, updated_at = excluded.updated_at`,
    packId, version, title, icon, level, version, now,
  );
  await enqueue(tx, 'LP_LIBRARY_CHANGED', { packId, version, state: 'active', updatedAt: now });
}

/** Removes a pack's content from this phone and from the account library. Progress is kept for a re-download. */
export async function deletePack(packId: string, opts: { fromSync?: boolean } = {}) {
  const dir = packDir(packId);
  if (dir.exists) dir.delete();
  const pack = await db.getFirstAsync<{ version: number }>('SELECT version FROM lp_packs WHERE pack_id = ?', packId);
  await db.withTransactionAsync(async () => {
    // Progress and chat history stay: they belong to the student, not to the downloaded files.
    for (const table of ['lp_modules', 'lp_topics', 'lp_items', 'lp_chunks', 'lp_days', 'lp_videos', 'lp_packs']) {
      await db.runAsync(`DELETE FROM ${table} WHERE pack_id = ?`, packId);
    }
    if (!opts.fromSync) {
      const now = new Date().toISOString();
      await db.runAsync("UPDATE lp_library SET state = 'deleted', updated_at = ? WHERE pack_id = ?", now, packId);
      await enqueue(db, 'LP_LIBRARY_CHANGED', { packId, version: pack?.version ?? 1, state: 'deleted', updatedAt: now });
    }
  });
  await kvDelete(sessionKey(packId));
  changed();
}

/**
 * When online: learn which saved packs have a newer version, and apply library
 * changes made on another device (a pack deleted there after it was downloaded here).
 */
export async function refreshPackStatus() {
  const local = await db.getAllAsync<{ pack_id: string; downloaded_at: string }>('SELECT pack_id, downloaded_at FROM lp_packs');
  if (await hasSession()) {
    const { packs } = await api<{ packs: { packId: string; version: number; state: 'active' | 'deleted'; updatedAt: string; title: string; icon: string; level: string; latestReadyVersion: number | null }[] }>(
      '/v1/learning-packs/library',
    );
    await db.withTransactionAsync(async () => {
      for (const p of packs) {
        await db.runAsync(
          `INSERT INTO lp_library (pack_id, version, state, title, icon, level, latest_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(pack_id) DO UPDATE SET latest_version = excluded.latest_version, title = excluded.title, icon = excluded.icon,
             version = CASE WHEN excluded.updated_at >= lp_library.updated_at THEN excluded.version ELSE lp_library.version END,
             state = CASE WHEN excluded.updated_at >= lp_library.updated_at THEN excluded.state ELSE lp_library.state END,
             updated_at = max(lp_library.updated_at, excluded.updated_at)`,
          p.packId, p.version, p.state, p.title, p.icon, p.level, p.latestReadyVersion, new Date(p.updatedAt).toISOString(),
        );
        if (p.latestReadyVersion) await db.runAsync('UPDATE lp_packs SET latest_version = ? WHERE pack_id = ?', p.latestReadyVersion, p.packId);
      }
    });
    for (const p of packs) {
      const here = local.find((l) => l.pack_id === p.packId);
      if (p.state === 'deleted' && here && new Date(p.updatedAt) > new Date(here.downloaded_at)) await deletePack(p.packId, { fromSync: true });
    }
  }
  // Packs not in the account library (guests, cached packs): ask one by one.
  const libraryIds = new Set((await db.getAllAsync<{ pack_id: string }>('SELECT pack_id FROM lp_library')).map((r) => r.pack_id));
  for (const l of local.filter((x) => !libraryIds.has(x.pack_id))) {
    try {
      const { pack } = await getRemotePack(l.pack_id);
      if (pack.latestReadyVersion) await db.runAsync('UPDATE lp_packs SET latest_version = ? WHERE pack_id = ?', pack.latestReadyVersion, l.pack_id);
    } catch (err) {
      if (err instanceof NetworkError) throw err;
    }
  }
  useApp.getState().bumpData();
}

/** Packs opened online but never downloaded are a cache: drop them after a week unused. */
export async function evictStaleCachedPacks() {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const stale = await db.getAllAsync<{ pack_id: string }>(
    'SELECT pack_id FROM lp_packs WHERE offline = 0 AND coalesce(last_opened_at, downloaded_at) < ?',
    cutoff,
  );
  for (const s of stale) await deletePack(s.pack_id, { fromSync: true });
}

// ═══════════════════════════ Local reads ═══════════════════════════

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * After a local write: refresh screens now, sync a moment later. A quiz records an
 * answer every few seconds; debouncing sends them as one batch instead of one
 * request each (the server allows 30 sync requests a minute).
 */
export function changed() {
  useApp.getState().bumpData();
  scheduleFlush();
}

function scheduleFlush() {
  void refreshPendingCount();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 3000);
}

/** Per-topic state: completion, bookmark, time, and accuracy over the most recent answers. */
export async function topicStates(packId: string): Promise<Map<string, TopicState>> {
  const progress = await db.getAllAsync<{ topic_id: string; completed_at: string | null; bookmarked: number; time_spent_sec: number }>(
    'SELECT topic_id, completed_at, bookmarked, time_spent_sec FROM lp_topic_progress WHERE pack_id = ?',
    packId,
  );
  const answers = await db.getAllAsync<{ topic_id: string; attempts: number; recent: number | null }>(
    `SELECT topic_id, count(*) AS attempts,
            (SELECT avg(score) FROM (SELECT score FROM lp_answers a2
                                      WHERE a2.pack_id = a.pack_id AND a2.topic_id = a.topic_id
                                      ORDER BY answered_at DESC LIMIT ${RECENT_ANSWERS})) AS recent
       FROM lp_answers a WHERE pack_id = ? GROUP BY topic_id`,
    packId,
  );
  const map = new Map<string, TopicState>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      s = { topicId: id, completed: false, bookmarked: false, timeSpentSec: 0, attempts: 0, recentAccuracy: null };
      map.set(id, s);
    }
    return s;
  };
  for (const p of progress) Object.assign(get(p.topic_id), { completed: p.completed_at != null, bookmarked: p.bookmarked === 1, timeSpentSec: p.time_spent_sec });
  for (const a of answers) Object.assign(get(a.topic_id), { attempts: a.attempts, recentAccuracy: a.recent });
  return map;
}

export type MyPack = {
  packId: string;
  title: string;
  icon: string;
  moduleCount: number;
  topicCount: number;
  levelFrom: string;
  levelTo: string;
  estimatedMinutes: number;
  sizeBytes: number;
  version: number;
  latestVersion: number | null;
  offline: boolean;
  onDevice: boolean;
  percent: number;
  weakCount: number;
  lastStudiedAt: string | null;
};

/** "My Learning Packs": packs on this phone, plus packs in the account library that aren't downloaded here. */
export async function listMyPacks(): Promise<MyPack[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT p.*, pr.updated_at AS progress_at FROM lp_packs p LEFT JOIN lp_progress pr ON pr.pack_id = p.pack_id
      ORDER BY coalesce(p.last_opened_at, p.downloaded_at) DESC`,
  );
  const out: MyPack[] = [];
  for (const r of rows) {
    const topics = await db.getAllAsync<{ id: string }>('SELECT id FROM lp_topics WHERE pack_id = ?', r.pack_id);
    const states = await topicStates(r.pack_id);
    out.push({
      packId: r.pack_id,
      title: r.title,
      icon: r.icon,
      moduleCount: r.module_count,
      topicCount: r.topic_count,
      levelFrom: r.level_from,
      levelTo: r.level_to,
      estimatedMinutes: r.estimated_minutes,
      sizeBytes: r.size_bytes,
      version: r.version,
      latestVersion: r.latest_version,
      offline: r.offline === 1,
      onDevice: true,
      percent: percentComplete(topics.map((t) => t.id), states),
      weakCount: topics.filter((t) => isWeak(states.get(t.id))).length,
      lastStudiedAt: r.last_opened_at ?? r.progress_at ?? null,
    });
  }
  const remote = await db.getAllAsync<any>(
    "SELECT l.* FROM lp_library l WHERE l.state = 'active' AND l.pack_id NOT IN (SELECT pack_id FROM lp_packs) ORDER BY l.updated_at DESC",
  );
  for (const r of remote) {
    const progress = await db.getFirstAsync<{ percent: number }>('SELECT percent FROM lp_progress WHERE pack_id = ?', r.pack_id);
    out.push({
      packId: r.pack_id, title: r.title, icon: r.icon, moduleCount: 0, topicCount: 0, levelFrom: r.level ?? '', levelTo: r.level ?? '',
      estimatedMinutes: 0, sizeBytes: 0, version: r.version, latestVersion: r.latest_version, offline: false, onDevice: false,
      percent: progress?.percent ?? 0, weakCount: 0, lastStudiedAt: r.updated_at,
    });
  }
  return out;
}

export type PackDetail = NonNullable<Awaited<ReturnType<typeof getPackDetail>>>;

export async function getPackDetail(packId: string) {
  const pack = await db.getFirstAsync<any>('SELECT * FROM lp_packs WHERE pack_id = ?', packId);
  if (!pack) return null;
  const modules = await db.getAllAsync<{ id: string; position: number; title: string; description: string }>(
    'SELECT id, position, title, description FROM lp_modules WHERE pack_id = ? ORDER BY position',
    packId,
  );
  const topics = await db.getAllAsync<{ id: string; module_id: string; title: string; difficulty: string; position: number; kind: TopicKind; day_number: number | null }>(
    'SELECT id, module_id, title, difficulty, position, kind, day_number FROM lp_topics WHERE pack_id = ? ORDER BY position',
    packId,
  );
  const dayRows = await db.getAllAsync<{ day_number: number; title: string; focus: string; topic_ids_json: string; estimated_minutes: number; completion_criteria: string }>(
    'SELECT * FROM lp_days WHERE pack_id = ? ORDER BY day_number',
    packId,
  );
  const videoStats = await db.getFirstAsync<{ total: number; downloaded: number; downloadable: number; bytes: number | null }>(
    `SELECT count(*) AS total, sum(status = 'downloaded') AS downloaded,
            sum(downloadable = 1 AND status <> 'downloaded') AS downloadable,
            sum(CASE WHEN status = 'downloaded' THEN coalesce(size_bytes, 0) ELSE 0 END) AS bytes
       FROM lp_videos WHERE pack_id = ?`,
    packId,
  );
  const states = await topicStates(packId);
  const progress = await db.getFirstAsync<{ current_topic_id: string | null; updated_at: string }>(
    'SELECT current_topic_id, updated_at FROM lp_progress WHERE pack_id = ?',
    packId,
  );
  const currentTopicId = progress?.current_topic_id && topics.some((t) => t.id === progress.current_topic_id) ? progress.current_topic_id : null;
  const resumeTopicId = currentTopicId ?? topics.find((t) => !states.get(t.id)?.completed)?.id ?? topics[0]?.id ?? null;
  const moduleList = modules.map((m) => ({ ...m, topicIds: topics.filter((t) => t.module_id === m.id).map((t) => t.id) }));
  const statuses: ModuleStatus[] = moduleStatuses(moduleList, states, currentTopicId);
  const all = [...states.values()].filter((s) => topics.some((t) => t.id === s.topicId));
  const answered = all.reduce((n, s) => n + s.attempts, 0);
  const accuracyRow = await db.getFirstAsync<{ avg: number | null }>('SELECT avg(score) AS avg FROM lp_answers WHERE pack_id = ?', packId);
  const topicView = (t: (typeof topics)[number]) => ({
    id: t.id,
    title: t.title,
    difficulty: t.difficulty,
    kind: t.kind,
    completed: !!states.get(t.id)?.completed,
    bookmarked: !!states.get(t.id)?.bookmarked,
    weak: isWeak(states.get(t.id)),
  });

  // Days: the same done / in progress / next / locked rules as modules, over each day's topics.
  const days = dayRows.map((d) => ({ ...d, topicIds: JSON.parse(d.topic_ids_json) as string[] }));
  const dayStatuses = moduleStatuses(days.map((d) => ({ id: String(d.day_number), topicIds: d.topicIds })), states, currentTopicId);
  const currentDay = days.find((d) => resumeTopicId && d.topicIds.includes(resumeTopicId))?.day_number ?? null;
  const planInfo = pack.plan_json ? (JSON.parse(pack.plan_json) as { coverageStatement: string; outcomes: string[]; notCovered: string[]; careerPaths: { title: string; relevance: string }[] }) : null;

  return {
    packId,
    title: pack.title as string,
    subject: pack.subject as string,
    description: pack.description as string,
    icon: pack.icon as string,
    levelFrom: pack.level_from as string,
    levelTo: pack.level_to as string,
    version: pack.version as number,
    latestVersion: pack.latest_version as number | null,
    offline: pack.offline === 1,
    sizeBytes: pack.size_bytes as number,
    estimatedMinutes: pack.estimated_minutes as number,
    optimizedAt: pack.optimized_at as string | null,
    bytesSaved: (pack.bytes_saved as number) ?? 0,
    lastUsedAt: (pack.last_opened_at ?? pack.downloaded_at) as string,
    percent: percentComplete(topics.map((t) => t.id), states),
    currentTopicId,
    resumeTopicId,
    plan: pack.duration_days
      ? {
          durationDays: pack.duration_days as number,
          dailyMinutes: pack.daily_minutes as number,
          goal: pack.goal as string | null,
          depth: pack.depth as Depth,
          coverageStatement: planInfo?.coverageStatement ?? '',
          outcomes: planInfo?.outcomes ?? [],
          notCovered: planInfo?.notCovered ?? [],
          careerPaths: planInfo?.careerPaths ?? [],
          currentDay,
          daysDone: dayStatuses.filter((x) => x === 'done').length,
        }
      : null,
    days: days.map((d, i) => ({
      dayNumber: d.day_number,
      title: d.title,
      focus: d.focus,
      estimatedMinutes: d.estimated_minutes,
      completionCriteria: d.completion_criteria,
      status: dayStatuses[i],
      topics: d.topicIds.map((id) => topics.find((t) => t.id === id)).filter((t): t is (typeof topics)[number] => !!t).map(topicView),
    })),
    modules: moduleList.map((m, i) => ({
      ...m,
      status: statuses[i],
      topics: topics.filter((t) => t.module_id === m.id).map(topicView),
    })),
    weakTopics: topics.filter((t) => isWeak(states.get(t.id))).map((t) => ({ id: t.id, title: t.title, accuracy: states.get(t.id)!.recentAccuracy! })),
    bookmarks: topics.filter((t) => states.get(t.id)?.bookmarked).map((t) => ({ id: t.id, title: t.title })),
    videos: {
      total: videoStats?.total ?? 0,
      downloaded: videoStats?.downloaded ?? 0,
      downloadable: videoStats?.downloadable ?? 0,
      bytes: videoStats?.bytes ?? 0,
    },
    stats: {
      timeSpentSec: all.reduce((n, s) => n + s.timeSpentSec, 0),
      answered,
      accuracy: accuracyRow?.avg ?? null,
      completedTopics: all.filter((s) => s.completed).length,
      topicCount: topics.length,
    },
  };
}

export async function getTopic(packId: string, topicId: string) {
  const row = await db.getFirstAsync<{ id: string; module_id: string; position: number; content_json: string; kind: TopicKind; day_number: number | null }>(
    'SELECT id, module_id, position, content_json, kind, day_number FROM lp_topics WHERE pack_id = ? AND id = ?',
    packId,
    topicId,
  );
  if (!row) return null;
  const [module, prev, next, total, state, counts, pack] = await Promise.all([
    db.getFirstAsync<{ title: string; position: number }>('SELECT title, position FROM lp_modules WHERE pack_id = ? AND id = ?', packId, row.module_id),
    db.getFirstAsync<{ id: string }>('SELECT id FROM lp_topics WHERE pack_id = ? AND position < ? ORDER BY position DESC LIMIT 1', packId, row.position),
    db.getFirstAsync<{ id: string }>('SELECT id FROM lp_topics WHERE pack_id = ? AND position > ? ORDER BY position LIMIT 1', packId, row.position),
    db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM lp_topics WHERE pack_id = ?', packId),
    topicStates(packId).then((m) => m.get(topicId)),
    db.getAllAsync<{ kind: ItemKind; n: number }>('SELECT kind, count(*) AS n FROM lp_items WHERE pack_id = ? AND topic_id = ? GROUP BY kind', packId, topicId),
    db.getFirstAsync<{ title: string }>('SELECT title FROM lp_packs WHERE pack_id = ?', packId),
  ]);
  const flashcards = (await db.getAllAsync<{ payload_json: string }>(
    "SELECT payload_json FROM lp_items WHERE pack_id = ? AND topic_id = ? AND kind = 'flashcard'",
    packId,
    topicId,
  )).map((r) => JSON.parse(r.payload_json) as { id: string; front: string; back: string });
  const videos = await listTopicVideos(packId, topicId);
  return {
    topic: JSON.parse(row.content_json) as TopicContent,
    kind: row.kind,
    dayNumber: row.day_number,
    videos,
    packTitle: pack?.title ?? '',
    moduleTitle: module?.title ?? '',
    modulePosition: module?.position ?? 0,
    index: row.position,
    total: total?.n ?? 0,
    previousId: prev?.id ?? null,
    nextId: next?.id ?? null,
    completed: !!state?.completed,
    bookmarked: !!state?.bookmarked,
    weak: isWeak(state),
    accuracy: state?.recentAccuracy ?? null,
    counts: Object.fromEntries(counts.map((c) => [c.kind, c.n])) as Partial<Record<ItemKind, number>>,
    flashcards,
  };
}

export type LocalVideo = Video & {
  status: 'remote' | 'downloaded' | 'offloaded';
  localUri: string | null;
  wantedOffline: boolean;
  positionSec: number;
  completed: boolean;
};

export async function listTopicVideos(packId: string, topicId?: string): Promise<LocalVideo[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT v.*, vp.position_sec, vp.completed_at FROM lp_videos v
       LEFT JOIN lp_video_progress vp ON vp.pack_id = v.pack_id AND vp.video_id = v.id
      WHERE v.pack_id = ? AND (? IS NULL OR v.topic_id = ?) ORDER BY v.source = 'user', v.added_at`,
    packId, topicId ?? null, topicId ?? null,
  );
  return rows.map((r) => ({
    id: r.id,
    topicId: r.topic_id,
    title: r.title,
    description: r.description,
    durationSec: r.duration_sec,
    source: r.source,
    url: r.url,
    downloadUrl: r.download_url,
    thumbnail: r.thumbnail,
    license: r.license,
    attribution: r.attribution,
    downloadable: r.downloadable === 1,
    sizeBytes: r.size_bytes,
    status: r.status,
    localUri: r.local_uri,
    wantedOffline: r.wanted_offline === 1,
    positionSec: r.position_sec ?? 0,
    completed: r.completed_at != null,
  }));
}

/** The most recently studied pack on this phone, for "Continue Learning". */
export async function getContinuePack() {
  const row = await db.getFirstAsync<{ pack_id: string; title: string; icon: string; current_topic_id: string | null; offline: number; duration_days: number | null }>(
    `SELECT p.pack_id, p.title, p.icon, pr.current_topic_id, p.offline, p.duration_days
       FROM lp_packs p JOIN lp_progress pr ON pr.pack_id = p.pack_id
      ORDER BY coalesce(p.last_opened_at, pr.updated_at) DESC LIMIT 1`,
  );
  if (!row) return null;
  const topic = row.current_topic_id
    ? await db.getFirstAsync<{ id: string; title: string; day_number: number | null }>(
        'SELECT id, title, day_number FROM lp_topics WHERE pack_id = ? AND id = ?',
        row.pack_id,
        row.current_topic_id,
      )
    : null;
  const topics = await db.getAllAsync<{ id: string }>('SELECT id FROM lp_topics WHERE pack_id = ?', row.pack_id);
  return {
    packId: row.pack_id,
    title: row.title,
    icon: row.icon,
    offline: row.offline === 1,
    topicId: topic?.id ?? null,
    topicTitle: topic?.title ?? null,
    dayNumber: topic?.day_number ?? null,
    durationDays: row.duration_days,
    percent: percentComplete(topics.map((t) => t.id), await topicStates(row.pack_id)),
  };
}

/** The bits of progress the online tutor and insights need. */
async function getProgressSummary(packId: string) {
  const topics = await db.getAllAsync<{ id: string }>('SELECT id FROM lp_topics WHERE pack_id = ? ORDER BY position', packId);
  const states = await topicStates(packId);
  const p = await db.getFirstAsync<{ current_topic_id: string | null }>('SELECT current_topic_id FROM lp_progress WHERE pack_id = ?', packId);
  return {
    currentTopicId: p?.current_topic_id ?? null,
    completedTopicIds: topics.filter((t) => states.get(t.id)?.completed).map((t) => t.id),
    weakTopicIds: topics.filter((t) => isWeak(states.get(t.id))).map((t) => t.id),
    percent: percentComplete(topics.map((t) => t.id), states),
  };
}

// ═══════════════════════════ Progress writes (offline-first) ═══════════════════════════
// Each write goes to SQLite and the sync outbox in one transaction.

async function packVersion(packId: string) {
  return (await db.getFirstAsync<{ version: number }>('SELECT version FROM lp_packs WHERE pack_id = ?', packId))?.version ?? 1;
}

async function percentNow(tx: SQLiteDatabase, packId: string) {
  const row = await tx.getFirstAsync<{ done: number; total: number }>(
    `SELECT (SELECT count(*) FROM lp_topic_progress tp JOIN lp_topics t ON t.pack_id = tp.pack_id AND t.id = tp.topic_id
              WHERE tp.pack_id = ? AND tp.completed_at IS NOT NULL) AS done,
            (SELECT count(*) FROM lp_topics WHERE pack_id = ?) AS total`,
    packId,
    packId,
  );
  return row && row.total ? Math.round((100 * row.done) / row.total) : 0;
}

async function setCurrentTopicTx(tx: SQLiteDatabase, packId: string, topicId: string | null) {
  const now = new Date().toISOString();
  const percent = await percentNow(tx, packId);
  await tx.runAsync(
    `INSERT INTO lp_progress (pack_id, percent, current_topic_id, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(pack_id) DO UPDATE SET percent = excluded.percent, current_topic_id = excluded.current_topic_id, updated_at = excluded.updated_at`,
    packId, percent, topicId, now,
  );
  await enqueue(tx, 'LP_PROGRESS_UPDATED', { packId, percent, currentTopicId: topicId, updatedAt: now });
}

/** The student opened a topic: it becomes "where I left off". */
export async function recordTopicOpened(packId: string, topicId: string) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await setCurrentTopicTx(db, packId, topicId);
    await db.runAsync(
      `INSERT INTO lp_topic_progress (pack_id, topic_id, last_seen_at) VALUES (?, ?, ?)
       ON CONFLICT(pack_id, topic_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      packId, topicId, now,
    );
    await db.runAsync('UPDATE lp_packs SET last_opened_at = ? WHERE pack_id = ?', now, packId);
  });
  changed();
}

export async function setCurrentTopic(packId: string, topicId: string) {
  await db.withTransactionAsync(() => setCurrentTopicTx(db, packId, topicId));
  changed();
}

export async function markTopicCompleted(packId: string, topicId: string) {
  const existing = await db.getFirstAsync<{ completed_at: string | null }>(
    'SELECT completed_at FROM lp_topic_progress WHERE pack_id = ? AND topic_id = ?',
    packId,
    topicId,
  );
  if (existing?.completed_at) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_topic_progress (pack_id, topic_id, completed_at) VALUES (?, ?, ?)
       ON CONFLICT(pack_id, topic_id) DO UPDATE SET completed_at = excluded.completed_at`,
      packId, topicId, now,
    );
    await enqueue(db, 'LP_TOPIC_UPDATED', { packId, topicId, completedAt: now, updatedAt: now });
    const p = await db.getFirstAsync<{ current_topic_id: string | null }>('SELECT current_topic_id FROM lp_progress WHERE pack_id = ?', packId);
    await setCurrentTopicTx(db, packId, p?.current_topic_id ?? topicId);
  });
  changed();
}

export async function toggleBookmark(packId: string, topicId: string, bookmarked: boolean) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_topic_progress (pack_id, topic_id, bookmarked, bookmark_updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(pack_id, topic_id) DO UPDATE SET bookmarked = excluded.bookmarked, bookmark_updated_at = excluded.bookmark_updated_at`,
      packId, topicId, bookmarked ? 1 : 0, now,
    );
    await enqueue(db, 'LP_TOPIC_UPDATED', { packId, topicId, bookmarked, updatedAt: now });
  });
  changed();
}

/**
 * Time on a topic (reading it or watching its video). Sent as deltas the server adds
 * exactly once, and counted towards today's study time (streaks, weekly activity).
 */
export async function addTimeSpent(packId: string, topicId: string, seconds: number) {
  const sec = Math.min(1800, Math.round(seconds)); // a screen left open isn't study time
  if (sec < 5) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_topic_progress (pack_id, topic_id, time_spent_sec) VALUES (?, ?, ?)
       ON CONFLICT(pack_id, topic_id) DO UPDATE SET time_spent_sec = lp_topic_progress.time_spent_sec + excluded.time_spent_sec`,
      packId, topicId, sec,
    );
    await enqueue(db, 'LP_TOPIC_UPDATED', { packId, topicId, timeSpentDeltaSec: sec, updatedAt: now });
    await addStudyTimeTx(db, sec);
    await db.runAsync('UPDATE lp_packs SET last_opened_at = ? WHERE pack_id = ?', now, packId);
  });
  changed();
}

export async function addStudyTimeTx(tx: SQLiteDatabase, seconds: number) {
  const day = localDay();
  await tx.runAsync(
    'INSERT INTO study_days (day, seconds) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET seconds = study_days.seconds + excluded.seconds',
    day, seconds,
  );
  await enqueue(tx, 'LP_STUDY_TIME', { day, secondsDelta: seconds });
}

/** Opening a pack in any way (lesson, tutor, video) counts as using it: storage clean-up keys off this. */
export async function touchPack(packId: string) {
  await db.runAsync('UPDATE lp_packs SET last_opened_at = ? WHERE pack_id = ?', new Date().toISOString(), packId);
}

export async function recordAnswer(
  packId: string,
  a: { topicId: string; itemId: string; kind: ItemKind; correct: boolean; score: number; response?: string },
) {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const version = await packVersion(packId);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_answers (id, pack_id, pack_version, topic_id, item_id, kind, correct, score, response, answered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, packId, version, a.topicId, a.itemId, a.kind, a.correct ? 1 : 0, a.score, a.response ?? null, now,
    );
    await enqueue(db, 'LP_ANSWER_RECORDED', {
      answerId: id, packId, packVersion: version, topicId: a.topicId, itemId: a.itemId, kind: a.kind,
      correct: a.correct, score: Math.max(0, Math.min(1, a.score)), answeredAt: now,
    });
  });
  changed();
}

// ═══════════════════════════ Pack-native quizzes (local) ═══════════════════════════
// A quiz only exists offline once it is saved here — online generation (generateQuiz)
// and offline sampling (buildOfflineQuiz) both end up calling saveQuizToPack, so every
// quiz the student can "Take" has a stable id, questions on disk, and attempts that
// sync like the rest of pack data.

export type SavedQuiz = { id: string; subject: string; difficulty: string; topicIds: string[]; source: 'online' | 'offline'; createdAt: string; questionCount: number };

/** Persists a generated (online or offline) quiz so it can be taken without internet. */
export async function saveQuizToPack(packId: string, quiz: GeneratedQuiz, source: 'online' | 'offline' = 'online'): Promise<string> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const version = await packVersion(packId);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_quizzes (pack_id, id, subject, difficulty, topic_ids_json, source, pack_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      packId, id, quiz.subject, quiz.difficulty, JSON.stringify(quiz.topicIds), source, version, now,
    );
    for (const [i, q] of quiz.questions.entries()) {
      await db.runAsync(
        `INSERT INTO lp_quiz_questions (pack_id, quiz_id, id, position, topic_id, question, options_json, correct_index, explanation, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        packId, id, q.id, i, q.topicId, q.question, JSON.stringify(q.options), q.correctIndex, q.explanation, q.difficulty,
      );
    }
    await enqueue(db, 'LP_QUIZ_SAVED', {
      quizId: id, packId, packVersion: version, subject: quiz.subject, difficulty: quiz.difficulty, topicIds: quiz.topicIds,
      questions: quiz.questions, source, createdAt: now,
    });
  });
  changed();
  return id;
}

export async function listPackQuizzes(packId: string): Promise<SavedQuiz[]> {
  const rows = await db.getAllAsync<{ id: string; subject: string; difficulty: string; topic_ids_json: string; source: 'online' | 'offline'; created_at: string; n: number }>(
    `SELECT q.id, q.subject, q.difficulty, q.topic_ids_json, q.source, q.created_at, (SELECT count(*) FROM lp_quiz_questions WHERE pack_id = q.pack_id AND quiz_id = q.id) AS n
       FROM lp_quizzes q WHERE q.pack_id = ? ORDER BY q.created_at DESC`,
    packId,
  );
  return rows.map((r) => ({ id: r.id, subject: r.subject, difficulty: r.difficulty, topicIds: JSON.parse(r.topic_ids_json), source: r.source, createdAt: r.created_at, questionCount: r.n }));
}

export async function getQuiz(packId: string, quizId: string): Promise<(SavedQuiz & { questions: QuizQuestion[] }) | null> {
  const quiz = await db.getFirstAsync<{ id: string; subject: string; difficulty: string; topic_ids_json: string; source: 'online' | 'offline'; created_at: string }>(
    'SELECT id, subject, difficulty, topic_ids_json, source, created_at FROM lp_quizzes WHERE pack_id = ? AND id = ?',
    packId, quizId,
  );
  if (!quiz) return null;
  const rows = await db.getAllAsync<{ id: string; topic_id: string; question: string; options_json: string; correct_index: number; explanation: string; difficulty: Level }>(
    'SELECT id, topic_id, question, options_json, correct_index, explanation, difficulty FROM lp_quiz_questions WHERE pack_id = ? AND quiz_id = ? ORDER BY position',
    packId, quizId,
  );
  const questions = rows.map((r) => ({ id: r.id, topicId: r.topic_id, question: r.question, options: JSON.parse(r.options_json), correctIndex: r.correct_index, explanation: r.explanation, difficulty: r.difficulty }));
  return { id: quiz.id, subject: quiz.subject, difficulty: quiz.difficulty, topicIds: JSON.parse(quiz.topic_ids_json), source: quiz.source, createdAt: quiz.created_at, questionCount: questions.length, questions };
}

/** Offline "Take Quiz": samples existing mcq items from the pack's own bank — never requires internet. */
export async function buildOfflineQuiz(packId: string, opts: { topicIds?: string[]; count: number }): Promise<GeneratedQuiz> {
  const rows = opts.topicIds?.length
    ? await db.getAllAsync<{ topic_id: string; payload_json: string }>(
        `SELECT topic_id, payload_json FROM lp_items WHERE pack_id = ? AND kind = 'mcq' AND topic_id IN (SELECT value FROM json_each(?)) ORDER BY RANDOM()`,
        packId, JSON.stringify(opts.topicIds),
      )
    : await db.getAllAsync<{ topic_id: string; payload_json: string }>(
        `SELECT topic_id, payload_json FROM lp_items WHERE pack_id = ? AND kind = 'mcq' ORDER BY RANDOM()`,
        packId,
      );
  const picked = rows.slice(0, opts.count);
  const pack = await db.getFirstAsync<{ title: string }>('SELECT title FROM lp_packs WHERE pack_id = ?', packId);
  const questions: QuizQuestion[] = picked.map((r) => {
    const mcq = JSON.parse(r.payload_json) as Mcq;
    return { id: mcq.id, topicId: r.topic_id, question: mcq.question, options: mcq.options, correctIndex: mcq.correctIndex, explanation: mcq.explanation, difficulty: mcq.difficulty };
  });
  return { subject: pack?.title ?? 'This pack', difficulty: 'medium', topicIds: opts.topicIds ?? [...new Set(questions.map((q) => q.topicId))], questions };
}

export type QuizAttemptResult = { score: number; total: number; correctCount: number; wrongCount: number; weakTopicIds: string[]; timeTakenSec: number };

/** Scores a quiz attempt, mirrors each answer into lp_answers (so existing mastery/weak-topic logic sees it too), and syncs the attempt summary. */
export async function recordQuizAttempt(
  packId: string,
  quizId: string,
  answers: { questionId: string; selectedIndex: number }[],
  startedAt: string,
): Promise<QuizAttemptResult> {
  const quiz = await getQuiz(packId, quizId);
  if (!quiz) throw new Error('Quiz not found');
  const byId = new Map(quiz.questions.map((q) => [q.id, q]));
  const perTopicCorrect = new Map<string, { correct: number; total: number }>();
  let correctCount = 0;
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const correct = a.selectedIndex === q.correctIndex;
    if (correct) correctCount++;
    const t = perTopicCorrect.get(q.topicId) ?? { correct: 0, total: 0 };
    t.total++;
    if (correct) t.correct++;
    perTopicCorrect.set(q.topicId, t);
    await recordAnswer(packId, { topicId: q.topicId, itemId: q.id, kind: 'mcq', correct, score: correct ? 1 : 0 });
  }
  const total = quiz.questions.length;
  const wrongCount = answers.length - correctCount;
  const weakTopicIds = [...perTopicCorrect.entries()].filter(([, s]) => s.correct / s.total < 0.5).map(([id]) => id);
  const now = new Date().toISOString();
  const timeTakenSec = Math.max(0, Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000));

  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_quiz_attempts (pack_id, quiz_id, id, answers_json, score, total, correct_count, wrong_count, weak_topics_json, time_taken_sec, started_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      packId, quizId, id, JSON.stringify(answers), correctCount, total, correctCount, wrongCount, JSON.stringify(weakTopicIds), timeTakenSec, startedAt, now,
    );
    await enqueue(db, 'LP_QUIZ_ATTEMPT', {
      attemptId: id, quizId, packId, answers, score: correctCount, total, correctCount, wrongCount, weakTopicIds, timeTakenSec, startedAt, submittedAt: now,
    });
  });
  changed();
  return { score: correctCount, total, correctCount, wrongCount, weakTopicIds, timeTakenSec };
}

export async function listQuizAttempts(packId: string, quizId: string) {
  return db.getAllAsync<{ id: string; score: number; total: number; submitted_at: string }>(
    'SELECT id, score, total, submitted_at FROM lp_quiz_attempts WHERE pack_id = ? AND quiz_id = ? ORDER BY submitted_at DESC',
    packId, quizId,
  );
}

// ═══════════════════════════ Offline tutor wiring ═══════════════════════════

const sessionKey = (packId: string) => `tutor.session.${packId}`;

/** Everything the offline tutor reads, loaded once when it opens (a pack is at most ~1 MB). */
export async function loadTutorData(packId: string): Promise<TutorData | null> {
  const pack = await db.getFirstAsync<{ version: number; title: string }>("SELECT version, title FROM lp_packs WHERE pack_id = ? AND state = 'ACTIVE'", packId);
  if (!pack) return null;
  const modules = await db.getAllAsync<{ id: string; position: number; title: string; summary: string; revision_notes: string }>(
    'SELECT id, position, title, summary, revision_notes FROM lp_modules WHERE pack_id = ? ORDER BY position',
    packId,
  );
  const topics = await db.getAllAsync<{ id: string; module_id: string; content_json: string }>(
    'SELECT id, module_id, content_json FROM lp_topics WHERE pack_id = ? ORDER BY position',
    packId,
  );
  const chunks = await db.getAllAsync<{ id: number; topic_id: string | null; field: string; label: string; text: string }>(
    'SELECT id, topic_id, field, label, text FROM lp_chunks WHERE pack_id = ? ORDER BY id',
    packId,
  );
  const days = await db.getAllAsync<{ day_number: number; title: string; focus: string; topic_ids_json: string; estimated_minutes: number; completion_criteria: string }>(
    'SELECT * FROM lp_days WHERE pack_id = ? ORDER BY day_number',
    packId,
  );
  return {
    packId,
    version: pack.version,
    title: pack.title,
    days: days.map((d) => ({
      dayNumber: d.day_number, title: d.title, focus: d.focus, topicIds: JSON.parse(d.topic_ids_json),
      estimatedMinutes: d.estimated_minutes, completionCriteria: d.completion_criteria,
    })),
    modules: modules.map((m) => ({
      id: m.id, position: m.position, title: m.title, summary: m.summary, revisionNotes: m.revision_notes,
      topicIds: topics.filter((t) => t.module_id === m.id).map((t) => t.id),
    })),
    topics: topics.map((t) => ({ ...(JSON.parse(t.content_json) as TopicContent), moduleId: t.module_id })),
    chunks: chunks.map((c) => ({ id: c.id, topicId: c.topic_id, field: c.field, label: c.label, text: c.text })),
  };
}

export function createTutorStore(packId: string): TutorStore {
  return {
    async items(topicIds, kind) {
      const rows = await db.getAllAsync<{ topic_id: string; payload_json: string }>(
        'SELECT topic_id, payload_json FROM lp_items WHERE pack_id = ? AND kind = ? AND topic_id IN (SELECT value FROM json_each(?))',
        packId,
        kind,
        JSON.stringify(topicIds),
      );
      return rows.map((r) => ({ kind, topicId: r.topic_id, data: JSON.parse(r.payload_json) }) as Item);
    },
    topicStates: () => topicStates(packId),
    async lastAnswers(topicIds) {
      const rows = await db.getAllAsync<{ item_id: string; correct: number }>(
        `SELECT item_id, correct FROM lp_answers a WHERE pack_id = ? AND topic_id IN (SELECT value FROM json_each(?))
           AND answered_at = (SELECT max(answered_at) FROM lp_answers b WHERE b.pack_id = a.pack_id AND b.item_id = a.item_id)`,
        packId,
        JSON.stringify(topicIds),
      );
      return new Map(rows.map((r) => [r.item_id, r.correct === 1]));
    },
    async currentTopicId() {
      return (await db.getFirstAsync<{ current_topic_id: string | null }>('SELECT current_topic_id FROM lp_progress WHERE pack_id = ?', packId))
        ?.current_topic_id ?? null;
    },
    setCurrentTopic: (topicId) => setCurrentTopic(packId, topicId),
    completeTopic: (topicId) => markTopicCompleted(packId, topicId),
    recordAnswer: (a) => recordAnswer(packId, a),
    loadSession: () => kvGet<TutorSession>(sessionKey(packId)),
    saveSession: (s) => kvSet(sessionKey(packId), s),
  };
}

// ── Chat history (synced across the student's devices) ──

/** The server's per-message limit; longer tutor replies are stored in full here and trimmed for sync. */
const CHAT_SYNC_MAX_CHARS = 20_000;
let lastChatAt = 0;

export type ChatMessage = {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  meta: { mode?: 'online' | 'offline'; quickReplies?: string[]; sources?: string[]; grounded?: boolean } | null;
  createdAt: string;
};

export async function loadChat(packId: string, limit = 60): Promise<ChatMessage[]> {
  const rows = await db.getAllAsync<{ id: string; role: 'user' | 'tutor'; text: string; meta_json: string | null; created_at: string }>(
    'SELECT * FROM (SELECT * FROM lp_chat WHERE pack_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at',
    packId,
    limit,
  );
  return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, meta: r.meta_json ? JSON.parse(r.meta_json) : null, createdAt: r.created_at }));
}

/**
 * Saves a chat message, and queues it for sync in the same transaction.
 * `sync: false` for device-specific messages (the greeting, connection errors) —
 * otherwise every phone would add its own copy to the shared history.
 */
export async function appendChat(
  packId: string,
  role: 'user' | 'tutor',
  text: string,
  meta: ChatMessage['meta'] = null,
  opts: { sync?: boolean } = {},
): Promise<ChatMessage> {
  // The offline tutor answers within the same millisecond as the question; a strictly
  // increasing timestamp keeps the conversation order exact here and on other devices.
  lastChatAt = Math.max(Date.now(), lastChatAt + 1);
  const m: ChatMessage = { id: Crypto.randomUUID(), role, text, meta, createdAt: new Date(lastChatAt).toISOString() };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO lp_chat (id, pack_id, role, text, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      m.id, packId, role, text, meta ? JSON.stringify(meta) : null, m.createdAt,
    );
    if (opts.sync !== false) {
      await enqueue(db, 'LP_CHAT_MESSAGE', {
        messageId: m.id,
        packId,
        role,
        text: text.slice(0, CHAT_SYNC_MAX_CHARS),
        meta: meta && {
          mode: meta.mode,
          quickReplies: meta.quickReplies?.slice(0, 8).map((q) => q.slice(0, 200)),
          sources: meta.sources?.slice(0, 8).map((x) => x.slice(0, 300)),
          grounded: meta.grounded,
        },
        createdAt: m.createdAt,
      });
    }
  });
  scheduleFlush();
  return m;
}

/** "New conversation": clears this pack's chat here and on the student's other devices. */
export async function clearChat(packId: string) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM lp_chat WHERE pack_id = ?', packId);
    await enqueue(db, 'LP_CHAT_CLEARED', { packId, clearedAt: now });
  });
  await kvDelete(sessionKey(packId));
  scheduleFlush();
}
