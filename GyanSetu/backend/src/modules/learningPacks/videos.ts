import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { complete } from '../ai/providers';
import { VIDEO_PICKS_JSON_SCHEMA, VideoPicksReply, type Outline, type Video } from './pack.schema';
import { VIDEO_SYSTEM, videoUser } from './prompts';

/**
 * Short educational videos for a pack.
 *
 * The model only decides *what to search for*; videos, durations and licences come
 * from provider APIs, so a link can never be invented. Download rights come from
 * the provider's licence metadata:
 * - Wikimedia Commons: public-domain / CC0 / CC BY / CC BY-SA files may be kept
 *   offline (the app downloads them straight from Commons and shows attribution).
 * - YouTube (only with YOUTUBE_API_KEY): stream-only. Its terms forbid downloading,
 *   so the app marks these "needs internet" and opens them online.
 * GyanSetu never re-hosts or redistributes a video file.
 */

type Candidate = Omit<Video, 'id' | 'topicId'>;
type Provider = { name: Video['source']; enabled: () => boolean; search: (query: string) => Promise<Candidate[]> };

const UA = 'GyanSetu/1.0 (educational app; https://gyansetu.app)'; // Wikimedia API policy requires a descriptive agent
const OPEN_LICENCE = /^(public domain|pd|cc0|cc[ -]?by( |-)?(sa)?[ -]?\d|cc[ -]?by(-sa)?$)/i;
const PLAYABLE = new Set(['video/webm', 'video/mp4']);

const stripHtml = (s: string | undefined) =>
  (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<any>;
}

const wikimedia: Provider = {
  name: 'wikimedia',
  enabled: () => true,
  async search(query) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '8',
      gsrsearch: `filetype:video ${query}`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '320',
    });
    const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    return Object.values<any>(data?.query?.pages ?? {}).flatMap((p): Candidate[] => {
      const info = p.imageinfo?.[0];
      if (!info?.url) return [];
      const meta = info.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value) || 'See source';
      const downloadable = PLAYABLE.has(info.mime) && OPEN_LICENCE.test(license);
      return [{
        title: stripHtml(meta.ObjectName?.value) || String(p.title ?? '').replace(/^File:/, '').replace(/\.\w+$/, ''),
        description: stripHtml(meta.ImageDescription?.value).slice(0, 300),
        durationSec: typeof info.duration === 'number' ? Math.round(info.duration) : null,
        source: 'wikimedia',
        url: info.descriptionurl ?? info.url,
        downloadUrl: downloadable ? info.url : null,
        thumbnail: info.thumburl ?? null,
        license,
        attribution: stripHtml(meta.Artist?.value).slice(0, 200) || 'Wikimedia Commons contributor',
        downloadable,
        sizeBytes: downloadable && typeof info.size === 'number' ? info.size : null,
      }];
    });
  },
};

/** "PT4M13S" → 253 */
export function isoDurationToSec(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
}

const youtube: Provider = {
  name: 'youtube',
  enabled: () => Boolean(env.YOUTUBE_API_KEY),
  async search(query) {
    const key = env.YOUTUBE_API_KEY!;
    const search = await getJson(
      `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({
        part: 'snippet', q: query, type: 'video', maxResults: '6', videoEmbeddable: 'true', safeSearch: 'strict',
        videoDuration: 'medium', relevanceLanguage: 'en', key,
      })}`,
    );
    const ids = (search.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
    if (ids.length === 0) return [];
    const details = await getJson(
      `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'snippet,contentDetails,status', id: ids.join(','), key })}`,
    );
    return (details.items ?? []).map((v: any): Candidate => ({
      title: v.snippet?.title ?? 'Video',
      description: String(v.snippet?.description ?? '').slice(0, 300),
      durationSec: isoDurationToSec(v.contentDetails?.duration),
      source: 'youtube',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      downloadUrl: null,
      thumbnail: v.snippet?.thumbnails?.medium?.url ?? null,
      license: v.status?.license === 'creativeCommon' ? 'CC BY (YouTube)' : 'Standard YouTube licence',
      attribution: v.snippet?.channelTitle ?? '',
      downloadable: false, // YouTube's terms: stream only
      sizeBytes: null,
    }));
  },
};

const PROVIDERS = [wikimedia, youtube];

function activeProviders(): Provider[] {
  const wanted = new Set(env.VIDEO_SOURCES.split(',').map((s) => s.trim()).filter(Boolean));
  return PROVIDERS.filter((p) => wanted.has(p.name) && p.enabled());
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** Best candidate: on topic (title shares the query's words), short enough, downloadable preferred. */
export function pickBest(candidates: Candidate[], query: string, maxMinutes: number): Candidate | null {
  const q = words(query);
  let best: { c: Candidate; score: number } | null = null;
  for (const c of candidates) {
    if (c.durationSec != null && (c.durationSec < 20 || c.durationSec > maxMinutes * 60)) continue;
    const title = words(`${c.title} ${c.description.slice(0, 120)}`);
    const overlap = [...q].filter((w) => title.has(w)).length / Math.max(1, q.size);
    if (overlap < 0.4) continue;
    const score = overlap * 2 + (c.downloadable ? 0.6 : 0) + (c.durationSec && c.durationSec <= 360 ? 0.3 : 0);
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

/**
 * Picks topics that benefit from a video and resolves real videos for them.
 * Never fails generation: any error means fewer (or no) videos.
 */
export async function findVideos(outline: Outline): Promise<Map<string, Video[]>> {
  const out = new Map<string, Video[]>();
  const providers = activeProviders();
  if (providers.length === 0) return out;

  const topics = outline.modules.flatMap((m) => m.topics).filter((t) => (t.kind ?? 'lesson') === 'lesson' || t.kind === 'project');
  if (topics.length === 0) return out;
  try {
    const result = await complete({
      system: VIDEO_SYSTEM,
      user: videoUser({ title: outline.title, level: outline.level, topics: topics.map((t) => ({ key: t.key, title: t.title, kind: t.kind ?? 'lesson' })), limit: Math.min(20, Math.ceil(topics.length / 2) + 2) }),
      schema: VIDEO_PICKS_JSON_SCHEMA,
      schemaName: 'video_picks',
      maxTokens: 3000,
    });
    if (result.kind !== 'json') return out;
    const parsed = VideoPicksReply.safeParse(JSON.parse(result.text));
    if (!parsed.success) return out;
    const valid = new Set(topics.map((t) => t.key));

    for (const pick of parsed.data.picks) {
      if (!valid.has(pick.topicKey) || out.has(pick.topicKey)) continue;
      const candidates = (
        await Promise.all(providers.map((p) => p.search(pick.query).catch((err) => {
          logger.warn({ provider: p.name, err: String(err) }, 'video search failed');
          return [] as Candidate[];
        })))
      ).flat();
      const best = pickBest(candidates, pick.query, pick.maxMinutes);
      if (!best) continue;
      const id = `${pick.topicKey}~vid-${createHash('sha1').update(best.url).digest('hex').slice(0, 10)}`;
      out.set(pick.topicKey, [{ id, topicId: pick.topicKey, ...best }]);
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'video selection skipped');
  }
  return out;
}
