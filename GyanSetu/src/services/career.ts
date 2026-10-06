import { kvGet, kvSet } from '@/db';
import { api, hasSession, NetworkError } from '@/lib/api';

/**
 * Career guidance: generated on the server from the student's synced learning data and
 * the interests/goals they entered, cached here so it can be read offline.
 */

export type CareerPath = {
  title: string;
  match: number;
  why: string[];
  skillsHave: string[];
  skillsToImprove: string[];
  nextPacks: { subject: string; durationDays: number; goal: string }[];
  projects: string[];
};

export type Roadmap = {
  goal: string;
  currentLevel: 'beginner' | 'intermediate' | 'advanced';
  skillAreas: { name: string; progress: number; evidence: string }[];
  nextSteps: { step: string; why: string; pack: { subject: string; durationDays: number } | null }[];
  milestones: string[];
};

export type Guidance = {
  summary: string;
  interests: { label: string; emoji: string; evidence: string }[];
  paths: CareerPath[];
  caveats: string;
  roadmaps: Record<string, Roadmap>;
};

export type CareerState = {
  status: 'insufficient_data' | 'not_generated' | 'ready';
  guidance: Guidance | null;
  generatedAt: string | null;
  outdated: boolean;
  /** When this copy was last fetched from the server (for "updated 3 days ago" offline). */
  fetchedAt?: string;
};

const KEY = 'career.guidance';

export async function cachedCareer(): Promise<CareerState | null> {
  return kvGet<CareerState>(KEY);
}

async function save(state: CareerState) {
  const s = { ...state, fetchedAt: new Date().toISOString() };
  await kvSet(KEY, s);
  return s;
}

export async function fetchCareer(): Promise<CareerState> {
  return save(await api<CareerState>('/v1/career/guidance'));
}

/** Regenerates when the learning evidence changed (the server returns the cached copy otherwise). */
export async function refreshCareer(force = false): Promise<CareerState> {
  return save(await api<CareerState>('/v1/career/guidance/refresh', { method: 'POST', body: { force }, timeoutMs: 120_000 }));
}

export async function fetchRoadmap(path: string): Promise<Roadmap> {
  const { roadmap } = await api<{ roadmap: Roadmap }>('/v1/career/roadmap', { method: 'POST', body: { path }, timeoutMs: 90_000 });
  const cached = await cachedCareer();
  if (cached?.guidance) await kvSet(KEY, { ...cached, guidance: { ...cached.guidance, roadmaps: { ...cached.guidance.roadmaps, [path]: roadmap } } });
  return roadmap;
}

/** Background refresh when online: at most once a day, and only when the server says the evidence changed. */
export async function backgroundCareerRefresh() {
  if (!(await hasSession())) return;
  const last = await kvGet<string>('career.lastAuto');
  if (last && Date.now() - new Date(last).getTime() < 24 * 3600 * 1000) return;
  await kvSet('career.lastAuto', new Date().toISOString());
  try {
    const state = await fetchCareer();
    if (state.status !== 'insufficient_data' && state.outdated) await refreshCareer();
  } catch (err) {
    if (!(err instanceof NetworkError)) console.warn('[career] refresh failed', err);
  }
}
