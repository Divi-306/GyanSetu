import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { db } from '@/db';
import { changed, deleteFileQuietly, listTopicVideos, packDir, touchPack, type LocalVideo } from './learningPacks';
import { enqueue } from './sync';

/**
 * Videos in learning packs.
 *
 * - Pack videos come from provider APIs. Only those marked `downloadable` (public-domain /
 *   openly licensed, e.g. Wikimedia Commons) can be saved offline; the phone downloads them
 *   straight from the source. Stream-only ones (YouTube) open online.
 * - The student's own videos are copied into the pack's folder and never uploaded or synced.
 * - Resume positions sync (except for the student's own videos, which exist on one phone only).
 */

export class VideoError extends Error {}

export const useVideoDownloads = create<{
  active: Record<string, number>; // `${packId}/${videoId}` → 0..1
  set: (key: string, p: number | null) => void;
}>((set) => ({
  active: {},
  set: (key, p) =>
    set((s) => {
      const active = { ...s.active };
      if (p == null) delete active[key];
      else active[key] = p;
      return { active };
    }),
}));

const videosDir = (packId: string) => {
  const dir = new Directory(packDir(packId), 'videos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

const safeName = (id: string) => id.replace(/[^\w.-]+/g, '_').slice(0, 80);
const extOf = (url: string, fallback = 'mp4') => /\.(webm|mp4|m4v|mov|ogv|mkv)(\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? fallback;

export async function getVideo(packId: string, videoId: string): Promise<LocalVideo | null> {
  return (await listTopicVideos(packId)).find((v) => v.id === videoId) ?? null;
}

/** Saves a downloadable (openly licensed) video for offline viewing, with live progress. */
export async function downloadVideo(packId: string, videoId: string) {
  const v = await getVideo(packId, videoId);
  if (!v) throw new VideoError('Video not found.');
  if (!v.downloadable || !v.downloadUrl) {
    throw new VideoError('This video can only be streamed (its licence doesn’t allow offline copies). It needs an internet connection.');
  }
  if (v.sizeBytes && Paths.availableDiskSpace < v.sizeBytes * 1.2) {
    throw new VideoError('Not enough storage on this phone for this video.');
  }
  const key = `${packId}/${videoId}`;
  const progress = useVideoDownloads.getState();
  progress.set(key, 0);
  const dest = new File(videosDir(packId), `${safeName(videoId)}.${extOf(v.downloadUrl)}`);
  try {
    const file = await File.downloadFileAsync(v.downloadUrl, dest, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : (v.sizeBytes ?? 0);
        if (total > 0) progress.set(key, Math.min(0.99, bytesWritten / total));
      },
    });
    await db.runAsync(
      "UPDATE lp_videos SET status = 'downloaded', local_uri = ?, size_bytes = ?, wanted_offline = 1 WHERE pack_id = ? AND id = ?",
      file.uri, file.size ?? v.sizeBytes, packId, videoId,
    );
    changed();
  } catch (err) {
    deleteFileQuietly(dest.uri);
    throw err instanceof VideoError ? err : new VideoError('Download failed. Check your internet connection and try again.');
  } finally {
    progress.set(key, null);
  }
}

/** Removes a saved video file. Pack videos stay listed (watch online / download again); own videos are removed. */
export async function removeVideoFile(packId: string, videoId: string) {
  const v = await getVideo(packId, videoId);
  if (!v) return;
  if (v.localUri) deleteFileQuietly(v.localUri);
  if (v.source === 'user') {
    await db.runAsync('DELETE FROM lp_videos WHERE pack_id = ? AND id = ?', packId, videoId);
    await db.runAsync('DELETE FROM lp_video_progress WHERE pack_id = ? AND video_id = ?', packId, videoId);
  } else {
    await db.runAsync("UPDATE lp_videos SET status = 'remote', local_uri = NULL, wanted_offline = 0 WHERE pack_id = ? AND id = ?", packId, videoId);
  }
  changed();
}

/** Lets the student attach a video they own (from their phone) to a topic. It never leaves the phone. */
export async function importUserVideo(packId: string, topicId: string): Promise<boolean> {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.length) return false;
  const asset = picked.assets[0];
  if (asset.size && Paths.availableDiskSpace < asset.size * 1.2) throw new VideoError('Not enough storage on this phone for this video.');
  const id = `user-${Crypto.randomUUID()}`;
  const dest = new File(videosDir(packId), `${id}.${extOf(asset.name ?? asset.uri)}`);
  new File(asset.uri).moveSync(dest);
  await db.runAsync(
    `INSERT INTO lp_videos (pack_id, id, topic_id, title, description, source, url, downloadable, size_bytes, local_uri, status, wanted_offline, added_at, license, attribution)
     VALUES (?, ?, ?, ?, '', 'user', ?, 0, ?, ?, 'downloaded', 1, ?, 'Your video', 'You')`,
    packId, id, topicId, (asset.name ?? 'My video').replace(/\.\w+$/, ''), dest.uri, dest.size ?? asset.size ?? null, dest.uri, new Date().toISOString(),
  );
  changed();
  return true;
}

/**
 * Saves where the student is in a video. Completed at 90%. Synced for pack videos
 * (position: newest wins; completion: never undone), local-only for their own videos.
 */
export async function recordVideoProgress(packId: string, video: Pick<LocalVideo, 'id' | 'source'>, positionSec: number, durationSec: number | null) {
  const now = new Date().toISOString();
  const done = durationSec && durationSec > 0 && positionSec >= durationSec * 0.9 ? now : null;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lp_video_progress (pack_id, video_id, position_sec, duration_sec, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(pack_id, video_id) DO UPDATE SET position_sec = excluded.position_sec,
         duration_sec = coalesce(excluded.duration_sec, lp_video_progress.duration_sec),
         completed_at = coalesce(lp_video_progress.completed_at, excluded.completed_at), updated_at = excluded.updated_at`,
      packId, video.id, positionSec, durationSec, done, now,
    );
    if (video.source !== 'user') {
      await enqueue(db, 'LP_VIDEO_PROGRESS', { packId, videoId: video.id, positionSec, durationSec, completedAt: done, updatedAt: now });
    }
  });
  await touchPack(packId);
  changed();
}
