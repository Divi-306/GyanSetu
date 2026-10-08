import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { db, kvDelete, kvGet, kvSet } from '@/db';
import { daysBetween, localDay } from '@/lib/dates';
import { selectOnline, useApp } from '@/stores/appStore';
import type { Flashcard, Mcq, Practice, TopicContent, Viva } from '@/tutor/types';
import { changed, deleteFileQuietly } from './learningPacks';
import { downloadVideo } from './videos';

/**
 * Offline storage: what uses space, and keeping it in check without ever losing learning.
 *
 * A pack on the phone is two kinds of data:
 *  - CORE (never removed by optimisation): the SQLite copy the app and offline tutor read
 *    (lessons, questions, answers, flashcards, retrieval index) and all student data
 *    (progress, bookmarks, quiz results, chat).
 *  - OPTIONAL: the verified pack archive file (a byte-exact copy kept for integrity and
 *    backup) and downloaded videos.
 *
 * "Optimise" = gzip the archive (text compresses ~4–6×, and the tutor never reads it, so
 * nothing gets slower) + remove downloaded videos that can be downloaded again from their
 * source. Videos are already compressed (H.264/VP9), so zipping them saves nothing;
 * offloading is the only real saving. The student's own videos are never removed.
 * SQLite is deliberately left uncompressed: the tutor searches it on every question.
 */

const DAY_MS = 86_400_000;
const OPTIMIZE_AFTER_DAYS = 7;
const ASK_DELETE_AFTER_DAYS = 30;
const NOTICES_KEY = 'storage.notices';

const fileSize = (uri: string | null) => {
  if (!uri) return 0;
  try {
    const f = new File(uri);
    return f.exists ? (f.size ?? 0) : 0;
  } catch {
    return 0;
  }
};

// ─────────────────────────── Sizes ───────────────────────────

export type PackStorage = {
  packId: string;
  title: string;
  icon: string;
  offline: boolean;
  archiveBytes: number;
  dataBytes: number; // estimated SQLite share of this pack
  videoBytes: number;
  videosDownloaded: number;
  videosTotal: number;
  ownVideos: number;
  optimized: boolean;
  compressed: boolean;
  lastUsedAt: string;
  daysUnused: number;
  totalBytes: number;
};

export async function packStorage(): Promise<PackStorage[]> {
  const packs = await db.getAllAsync<any>('SELECT * FROM lp_packs ORDER BY coalesce(last_opened_at, downloaded_at) DESC');
  const out: PackStorage[] = [];
  for (const p of packs) {
    const data = await db.getFirstAsync<{ n: number | null }>(
      `SELECT (SELECT coalesce(sum(length(content_json)), 0) FROM lp_topics WHERE pack_id = ?1)
            + (SELECT coalesce(sum(length(payload_json)), 0) FROM lp_items WHERE pack_id = ?1)
            + (SELECT coalesce(sum(length(text)), 0) FROM lp_chunks WHERE pack_id = ?1) AS n`,
      p.pack_id,
    );
    const videos = await db.getAllAsync<{ local_uri: string | null; status: string; source: string }>(
      'SELECT local_uri, status, source FROM lp_videos WHERE pack_id = ?',
      p.pack_id,
    );
    const downloaded = videos.filter((v) => v.status === 'downloaded');
    const archiveBytes = fileSize(p.file_uri);
    const videoBytes = downloaded.reduce((s, v) => s + fileSize(v.local_uri), 0);
    const dataBytes = Math.round((data?.n ?? 0) * 1.3); // rows + indexes
    const lastUsedAt = p.last_opened_at ?? p.downloaded_at;
    out.push({
      packId: p.pack_id,
      title: p.title,
      icon: p.icon,
      offline: p.offline === 1,
      archiveBytes,
      dataBytes,
      videoBytes,
      videosDownloaded: downloaded.length,
      videosTotal: videos.length,
      ownVideos: videos.filter((v) => v.source === 'user').length,
      optimized: Boolean(p.optimized_at),
      compressed: String(p.file_uri).endsWith('.gz'),
      lastUsedAt,
      daysUnused: Math.floor((Date.now() - new Date(lastUsedAt).getTime()) / DAY_MS),
      totalBytes: archiveBytes + dataBytes + videoBytes,
    });
  }
  return out;
}

export async function storageSummary() {
  const packs = await packStorage();
  const dbFile = new File(Paths.document, 'SQLite', 'gyansetu.db');
  const dbBytes = dbFile.exists ? (dbFile.size ?? 0) : 0;
  const packDataBytes = packs.reduce((s, p) => s + p.dataBytes, 0);
  const videoBytes = packs.reduce((s, p) => s + p.videoBytes, 0);
  const archiveBytes = packs.filter((p) => !p.compressed).reduce((s, p) => s + p.archiveBytes, 0);
  const compressedBytes = packs.filter((p) => p.compressed).reduce((s, p) => s + p.archiveBytes, 0);
  const otherBytes = Math.max(0, dbBytes - packDataBytes); // progress, chat, classic courses, outbox
  return {
    packs,
    learningPackBytes: packDataBytes + archiveBytes,
    videoBytes,
    compressedBytes,
    otherBytes,
    totalBytes: packDataBytes + archiveBytes + videoBytes + compressedBytes + otherBytes,
    deviceFreeBytes: Paths.availableDiskSpace,
    deviceTotalBytes: Paths.totalDiskSpace,
  };
}

// ─────────────────────────── Optimise / restore ───────────────────────────

/** The pack archive as text, compressed or not (e.g. for export). */
export async function readPackArchive(packId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ file_uri: string }>('SELECT file_uri FROM lp_packs WHERE pack_id = ?', packId);
  if (!row) return null;
  const f = new File(row.file_uri);
  if (!f.exists) return null;
  return row.file_uri.endsWith('.gz') ? strFromU8(gunzipSync(await f.bytes())) : f.text();
}

/**
 * Compresses optional data. Safe to run on any pack: core data and progress are untouched,
 * and every step is reversible (see restorePack). Returns the bytes saved.
 */
export async function optimizePack(packId: string): Promise<number> {
  const p = await db.getFirstAsync<{ file_uri: string; optimized_at: string | null; bytes_saved: number }>(
    'SELECT file_uri, optimized_at, bytes_saved FROM lp_packs WHERE pack_id = ?',
    packId,
  );
  if (!p) return 0;
  let saved = 0;

  // 1. Archive → gzip (verified by decompressing before the original is removed).
  if (!p.file_uri.endsWith('.gz')) {
    const original = new File(p.file_uri);
    if (original.exists) {
      const text = await original.text();
      const zipped = gzipSync(strToU8(text), { level: 9 });
      if (strFromU8(gunzipSync(zipped)) !== text) throw new Error('Compression check failed; pack left unchanged.');
      const gz = new File(`${p.file_uri}.gz`);
      gz.write(zipped);
      saved += (original.size ?? text.length) - (gz.size ?? zipped.length);
      original.delete();
      await db.runAsync('UPDATE lp_packs SET file_uri = ? WHERE pack_id = ?', gz.uri, packId);
    }
  }

  // 2. Re-downloadable videos → offloaded (metadata and resume position kept). Own videos stay.
  const videos = await db.getAllAsync<{ id: string; local_uri: string | null }>(
    "SELECT id, local_uri FROM lp_videos WHERE pack_id = ? AND status = 'downloaded' AND source <> 'user' AND downloadable = 1 AND download_url IS NOT NULL",
    packId,
  );
  for (const v of videos) {
    saved += fileSize(v.local_uri);
    if (v.local_uri) deleteFileQuietly(v.local_uri);
    await db.runAsync("UPDATE lp_videos SET status = 'offloaded', local_uri = NULL WHERE pack_id = ? AND id = ?", packId, v.id);
  }

  await db.runAsync(
    'UPDATE lp_packs SET optimized_at = ?, bytes_saved = ? WHERE pack_id = ?',
    new Date().toISOString(), (p.bytes_saved ?? 0) + Math.max(0, saved), packId,
  );
  changed();
  return Math.max(0, saved);
}

/**
 * Undoes optimisation: the archive is decompressed (offline-safe) and offloaded videos are
 * downloaded again (needs internet; any that can't be fetched now stay offloaded).
 */
export async function restorePack(packId: string): Promise<{ videosRestored: number; videosPending: number }> {
  const p = await db.getFirstAsync<{ file_uri: string }>('SELECT file_uri FROM lp_packs WHERE pack_id = ?', packId);
  if (!p) return { videosRestored: 0, videosPending: 0 };
  if (p.file_uri.endsWith('.gz')) {
    const gz = new File(p.file_uri);
    if (gz.exists) {
      const plain = new File(p.file_uri.replace(/\.gz$/, ''));
      plain.write(strFromU8(gunzipSync(await gz.bytes())));
      gz.delete();
      await db.runAsync('UPDATE lp_packs SET file_uri = ? WHERE pack_id = ?', plain.uri, packId);
    }
  }
  const offloaded = await db.getAllAsync<{ id: string }>("SELECT id FROM lp_videos WHERE pack_id = ? AND status = 'offloaded'", packId);
  let restored = 0;
  if (selectOnline(useApp.getState())) {
    for (const v of offloaded) {
      try {
        await downloadVideo(packId, v.id);
        restored++;
      } catch (err) {
        console.warn('[storage] video restore failed', err);
      }
    }
  }
  const pending = offloaded.length - restored;
  if (pending === 0) await db.runAsync('UPDATE lp_packs SET optimized_at = NULL, bytes_saved = 0 WHERE pack_id = ?', packId);
  changed();
  return { videosRestored: restored, videosPending: pending };
}

/** "Clear cached videos": removes downloaded pack videos everywhere. Own videos are kept. */
export async function clearCachedVideos(): Promise<number> {
  const videos = await db.getAllAsync<{ pack_id: string; id: string; local_uri: string | null }>(
    "SELECT pack_id, id, local_uri FROM lp_videos WHERE status = 'downloaded' AND source <> 'user'",
  );
  let freed = 0;
  for (const v of videos) {
    freed += fileSize(v.local_uri);
    if (v.local_uri) deleteFileQuietly(v.local_uri);
    await db.runAsync("UPDATE lp_videos SET status = 'remote', local_uri = NULL, wanted_offline = 0 WHERE pack_id = ? AND id = ?", v.pack_id, v.id);
  }
  changed();
  return freed;
}

// ─────────────────────────── Automatic maintenance ───────────────────────────

export type StorageNotice =
  | { id: string; kind: 'optimized'; packId: string; title: string; bytesSaved: number; at: string }
  | { id: string; kind: 'unused'; packId: string; title: string; bytes: number; days: number; at: string };

export async function getNotices(): Promise<StorageNotice[]> {
  return (await kvGet<StorageNotice[]>(NOTICES_KEY)) ?? [];
}

export async function dismissNotice(id: string) {
  await kvSet(NOTICES_KEY, (await getNotices()).filter((n) => n.id !== id));
  changed();
}

/** "Keep Pack": stop asking about this pack for another 30 days. */
export async function keepPack(packId: string) {
  await kvSet(`storage.keep.${packId}`, localDay(new Date(Date.now() + ASK_DELETE_AFTER_DAYS * DAY_MS)));
  await kvSet(NOTICES_KEY, (await getNotices()).filter((n) => !(n.kind === 'unused' && n.packId === packId)));
  changed();
}

/**
 * Runs at launch and when the app returns to the foreground (at most twice a day):
 * - unused ≥ 7 days → optimise optional data automatically (reversible) and tell the student;
 * - unused ≥ 30 days → ASK whether to delete. Nothing is ever deleted without the student.
 */
export async function runStorageMaintenance(now = new Date()): Promise<StorageNotice[]> {
  const last = await kvGet<string>('storage.lastMaintenance');
  if (last && now.getTime() - new Date(last).getTime() < 12 * 3600 * 1000) return getNotices();
  await kvSet('storage.lastMaintenance', now.toISOString());

  const notices = await getNotices();
  for (const p of await packStorage()) {
    const unused = Math.floor((now.getTime() - new Date(p.lastUsedAt).getTime()) / DAY_MS);
    const worthOptimising = !p.compressed || p.videosDownloaded - p.ownVideos > 0;
    if (unused >= OPTIMIZE_AFTER_DAYS && !p.optimized && worthOptimising) {
      try {
        const bytesSaved = await optimizePack(p.packId);
        if (bytesSaved > 0) {
          notices.push({ id: Crypto.randomUUID(), kind: 'optimized', packId: p.packId, title: p.title, bytesSaved, at: now.toISOString() });
        }
      } catch (err) {
        console.warn('[storage] optimise failed', err);
      }
    }
    const keepUntil = await kvGet<string>(`storage.keep.${p.packId}`);
    const snoozed = keepUntil && daysBetween(localDay(now), keepUntil) > 0;
    const alreadyAsked = notices.some((n) => n.kind === 'unused' && n.packId === p.packId);
    if (unused >= ASK_DELETE_AFTER_DAYS && !snoozed && !alreadyAsked) {
      notices.push({ id: Crypto.randomUUID(), kind: 'unused', packId: p.packId, title: p.title, bytes: p.totalBytes, days: unused, at: now.toISOString() });
    }
  }
  await kvSet(NOTICES_KEY, notices.slice(-20));
  changed();
  return notices;
}

// ─────────────────────────── Dev-only: test the 7/30-day timers without waiting ───────────────────────────

/**
 * DEV BUILDS ONLY. Pretends a pack hasn't been opened for `daysAgo` days, clears any
 * "Keep Pack" snooze and the maintenance throttle, then runs maintenance immediately —
 * so the 7-day auto-compress and 30-day deletion-warning logic can be verified on demand
 * instead of waiting for real time to pass. A no-op in production builds.
 */
export async function devSimulateUnused(packId: string, daysAgo: number): Promise<StorageNotice[]> {
  if (!__DEV__) return getNotices();
  const at = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  await db.runAsync('UPDATE lp_packs SET last_opened_at = ? WHERE pack_id = ?', at, packId);
  await kvDelete(`storage.keep.${packId}`);
  await kvDelete('storage.lastMaintenance');
  changed();
  return runStorageMaintenance();
}

/** Export/backup before deleting: the student's progress for one pack, as JSON they can save or share. */
export async function exportPackProgress(packId: string) {
  const [pack, topics, answers, progress, videos] = await Promise.all([
    db.getFirstAsync<{ title: string; version: number }>('SELECT title, version FROM lp_packs WHERE pack_id = ?', packId),
    db.getAllAsync('SELECT topic_id, completed_at, bookmarked, time_spent_sec FROM lp_topic_progress WHERE pack_id = ?', packId),
    db.getAllAsync('SELECT topic_id, item_id, kind, correct, score, answered_at FROM lp_answers WHERE pack_id = ?', packId),
    db.getFirstAsync('SELECT percent, current_topic_id, updated_at FROM lp_progress WHERE pack_id = ?', packId),
    db.getAllAsync('SELECT video_id, position_sec, completed_at FROM lp_video_progress WHERE pack_id = ?', packId),
  ]);
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), app: 'GyanSetu', packId, title: pack?.title, version: pack?.version, progress, topics, answers, videos },
    null,
    2,
  );
}

// ─────────────────────────── Download a pack as a file ───────────────────────────
// Reads whatever is CURRENTLY downloaded locally for this pack — a freshly generated
// pack, or one just updated to a new version — so the file always matches what's on
// the phone right now, never a stale earlier version.

const mcqLetter = (i: number) => String.fromCharCode(65 + i);

/** The full content of one downloaded pack (lessons, examples, quizzes), as readable Markdown. */
export async function exportPackContent(packId: string): Promise<string> {
  const pack = await db.getFirstAsync<{ title: string; subject: string; description: string; version: number; level_from: string; level_to: string; plan_json: string | null }>(
    'SELECT title, subject, description, version, level_from, level_to, plan_json FROM lp_packs WHERE pack_id = ?',
    packId,
  );
  if (!pack) throw new Error('This pack is not downloaded on this phone.');
  const modules = await db.getAllAsync<{ id: string; position: number; title: string; description: string }>(
    'SELECT id, position, title, description FROM lp_modules WHERE pack_id = ? ORDER BY position',
    packId,
  );
  const topics = await db.getAllAsync<{ id: string; module_id: string; position: number; title: string; content_json: string }>(
    'SELECT id, module_id, position, title, content_json FROM lp_topics WHERE pack_id = ? ORDER BY position',
    packId,
  );
  const items = await db.getAllAsync<{ topic_id: string; kind: string; payload_json: string }>(
    "SELECT topic_id, kind, payload_json FROM lp_items WHERE pack_id = ? AND source = 'pack' ORDER BY topic_id",
    packId,
  );
  const byTopic = new Map<string, { mcqs: Mcq[]; viva: Viva[]; practice: Practice[]; flashcards: Flashcard[] }>();
  const bucket = (topicId: string) => {
    let b = byTopic.get(topicId);
    if (!b) {
      b = { mcqs: [], viva: [], practice: [], flashcards: [] };
      byTopic.set(topicId, b);
    }
    return b;
  };
  for (const row of items) {
    const payload = JSON.parse(row.payload_json);
    if (row.kind === 'mcq') bucket(row.topic_id).mcqs.push(payload);
    else if (row.kind === 'viva') bucket(row.topic_id).viva.push(payload);
    else if (row.kind === 'practice') bucket(row.topic_id).practice.push(payload);
    else if (row.kind === 'flashcard') bucket(row.topic_id).flashcards.push(payload);
  }

  const lines: string[] = [];
  lines.push(`# ${pack.title}`, '');
  if (pack.subject && pack.subject !== pack.title) lines.push(`*${pack.subject}*`, '');
  if (pack.description) lines.push(pack.description, '');
  lines.push(`Level: ${pack.level_from}${pack.level_to && pack.level_to !== pack.level_from ? ` → ${pack.level_to}` : ''} · Version ${pack.version}`, '');
  if (pack.plan_json) {
    try {
      const plan = JSON.parse(pack.plan_json) as { coverageStatement?: string; outcomes?: string[] };
      if (plan.coverageStatement) lines.push(plan.coverageStatement, '');
      if (plan.outcomes?.length) lines.push('**By the end you can:**', ...plan.outcomes.map((o) => `- ${o}`), '');
    } catch {
      // ignore malformed plan metadata, the rest of the export still matters
    }
  }
  lines.push('---', '');

  for (const m of modules) {
    lines.push(`## ${m.position}. ${m.title}`, '');
    if (m.description) lines.push(m.description, '');
    for (const t of topics.filter((x) => x.module_id === m.id)) {
      const content = JSON.parse(t.content_json) as TopicContent;
      lines.push(`### ${t.title}`, '');
      if (content.explanation) lines.push(content.explanation, '');
      if (content.analogy) lines.push(`**Analogy:** ${content.analogy}`, '');
      if (content.keyPoints?.length) lines.push('**Key points:**', ...content.keyPoints.map((k) => `- ${k}`), '');
      for (const ex of content.examples ?? []) {
        lines.push(`**Example — ${ex.title}:** ${ex.body}`);
        if (ex.code) lines.push('```' + (ex.language || ''), ex.code, '```');
        lines.push('');
      }
      if (content.formulas?.length) lines.push('**Formulas:**', ...content.formulas.map((f) => `- ${f.name}: ${f.expression} — ${f.meaning}`), '');
      if (content.commonMistakes?.length) lines.push('**Common mistakes:**', ...content.commonMistakes.map((c) => `- ${c.mistake} → ${c.correction}`), '');

      const it = byTopic.get(t.id);
      if (it?.mcqs.length) {
        lines.push('**Quiz:**', '');
        it.mcqs.forEach((q, i) => {
          lines.push(`${i + 1}. ${q.question}`);
          q.options.forEach((opt, j) => lines.push(`   ${mcqLetter(j)}. ${opt}`));
          lines.push(`   *Answer: ${mcqLetter(q.correctIndex)} — ${q.explanation}*`, '');
        });
      }
      if (it?.flashcards.length) {
        lines.push('**Flashcards:**', ...it.flashcards.map((f) => `- Q: ${f.front} / A: ${f.back}`), '');
      }
      if (content.summary) lines.push(`> ${content.summary}`, '');
    }
  }
  lines.push('---', '', `Exported from GyanSetu on ${new Date().toLocaleDateString()}`);
  return lines.join('\n');
}

/** A readable file name GyanSetu writes for this pack, e.g. "Geography_Learning_Pack.md". */
function packFileName(title: string): string {
  const safe = title.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Learning_Pack';
  return `${safe}_Learning_Pack.md`;
}

/** Writes the pack's current content to a real file the student can save/share. */
export async function writePackFile(packId: string): Promise<{ uri: string; filename: string }> {
  const [markdown, pack] = await Promise.all([
    exportPackContent(packId),
    db.getFirstAsync<{ title: string }>('SELECT title FROM lp_packs WHERE pack_id = ?', packId),
  ]);
  const filename = packFileName(pack?.title ?? 'Learning Pack');
  const file = new File(Paths.cache, filename);
  file.write(markdown);
  return { uri: file.uri, filename };
}

/**
 * "Download" a pack: writes its current content to a real file and hands it to the OS
 * share/save sheet. Works the same for a newly generated pack, a just-updated/customized
 * one, or any existing downloaded pack — it always reads whatever is on the phone right
 * now, so there's no stale-content risk. Throws if sharing isn't available on this device.
 */
export async function sharePackFile(packId: string): Promise<void> {
  const { uri, filename } = await writePackFile(packId);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving files is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'text/markdown', dialogTitle: filename });
}
