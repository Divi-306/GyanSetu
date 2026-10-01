import { db, kvDelete, kvGet, kvSet } from '@/db';
import { api, ApiError, clearSession, getRefreshToken, hasSession, NetworkError, saveSession } from '@/lib/api';
import { getDeviceId } from '@/lib/device';
import { useApp, type User } from '@/stores/appStore';
import { clearStudentData } from './learning';
import { resetSyncCursor, syncNow } from './sync';

type AuthResponse = { user: User; accessToken: string; refreshToken: string };

const USER_KEY = 'session.user';

async function startSession(res: AuthResponse) {
  await saveSession(res);
  await kvSet(USER_KEY, res.user);
  useApp.getState().setSession(res.user);
  // Guest progress queued before login is sent under the new account, then server data is pulled in.
  void syncNow();
}

export async function login(identifier: string, password: string) {
  const res = await api<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: { identifier: identifier.trim(), password, deviceId: await getDeviceId() },
  });
  await startSession(res);
}

export async function signup(input: { name: string; email?: string; phone?: string; password: string; preferredLanguage?: 'en' | 'hi' }) {
  const res = await api<AuthResponse>('/v1/auth/signup', {
    method: 'POST',
    auth: false,
    body: { ...input, deviceId: await getDeviceId() },
  });
  await startSession(res);
}

export async function requestPasswordReset(identifier: string) {
  await api('/v1/auth/forgot-password', { method: 'POST', auth: false, body: { identifier: identifier.trim() } });
}

export async function resetPassword(token: string, newPassword: string) {
  await api('/v1/auth/reset-password', { method: 'POST', auth: false, body: { token, newPassword } });
}

/**
 * Restores the session at startup from the cached user, so the app opens
 * instantly offline. When online, refreshes the user from the server.
 */
export async function restoreSession() {
  if (!(await hasSession())) {
    useApp.getState().setSession(null);
    return;
  }
  const cached = await kvGet<User>(USER_KEY);
  useApp.getState().setSession(cached);
  try {
    const { user } = await api<{ user: User }>('/v1/me');
    await kvSet(USER_KEY, user);
    useApp.getState().setSession(user);
  } catch (err) {
    // 401 after a failed refresh means the session is over; offline content stays usable.
    if (err instanceof ApiError && err.status === 401) await endSessionLocally();
    else if (!(err instanceof NetworkError)) console.warn('[session] restore failed', err);
  }
}

async function endSessionLocally() {
  await clearSession();
  await kvDelete(USER_KEY);
  useApp.getState().setSession(null);
}

/** Number of changes not yet sent to the server (shown before logging out). */
export async function pendingChanges() {
  const row = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM sync_queue WHERE status = 'PENDING'");
  return row?.n ?? 0;
}

/**
 * Logs out: tries to send pending changes first, revokes the refresh token,
 * then clears this student's local progress so the next person on a shared
 * phone starts fresh. Downloaded packs are kept.
 */
export async function logout() {
  await syncNow();
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await api('/v1/auth/logout', { method: 'POST', auth: false, body: { refreshToken } }).catch(() => {});
  }
  await endSessionLocally();
  await resetSyncCursor();
  await clearStudentData();
}

export async function deleteAccount() {
  await api('/v1/me', { method: 'DELETE' });
  await endSessionLocally();
  await resetSyncCursor();
  await clearStudentData();
}

// ─────────────────────────── Profile ───────────────────────────

export type Profile = {
  dateOfBirth: string | null;
  gender: 'female' | 'male' | 'other' | 'prefer_not' | null;
  state: string | null;
  category: 'GEN' | 'OBC' | 'SC' | 'ST' | 'EWS' | null;
  annualFamilyIncome: number | null;
  educationLevel: 'school' | 'diploma' | 'undergraduate' | 'postgraduate' | null;
  institution: string | null;
  currentCourse: string | null;
  semester: number | null;
  isPwd: boolean | null;
  interests: string[];
  goals: string | null;
  dataConsent: boolean;
};

export const EMPTY_PROFILE: Profile = {
  dateOfBirth: null, gender: null, state: null, category: null, annualFamilyIncome: null,
  educationLevel: null, institution: null, currentCourse: null, semester: null, isPwd: null,
  interests: [], goals: null, dataConsent: false,
};

export async function getProfile(): Promise<Profile> {
  try {
    const { profile } = await api<{ profile: Profile | null }>('/v1/me/profile');
    return profile ?? EMPTY_PROFILE;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return EMPTY_PROFILE;
    throw err;
  }
}

export async function saveProfile(profile: Profile) {
  const { profile: saved } = await api<{ profile: Profile }>('/v1/me/profile', { method: 'PUT', body: profile });
  return saved;
}

export async function updateUser(patch: { name?: string; preferredLanguage?: 'en' | 'hi' }) {
  const { user } = await api<{ user: User }>('/v1/me', { method: 'PATCH', body: patch });
  await kvSet(USER_KEY, user);
  useApp.getState().setSession(user);
}

// ─────────────────────────── Scholarships ───────────────────────────

export type ScholarshipMatch = {
  status: 'likely_eligible' | 'check_details' | 'not_eligible';
  reasons: { label: string; field: string; met: boolean | null }[];
  missingFields: string[];
};

export type Scholarship = {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  amount: string | null;
  deadline: string | null;
  applyUrl: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  match: ScholarshipMatch;
};

export type ScholarshipList = {
  fetchedAt: string;
  profileComplete: boolean;
  disclaimer: string;
  scholarships: Scholarship[];
};

const SCHOLARSHIPS_KEY = 'cache.scholarships';

/** Online: fresh list, cached for offline. Offline: the cached list with `stale: true`. */
export async function loadScholarships(): Promise<(ScholarshipList & { stale: boolean }) | null> {
  try {
    const list = await api<ScholarshipList>('/v1/scholarships');
    await kvSet(SCHOLARSHIPS_KEY, list);
    return { ...list, stale: false };
  } catch (err) {
    if (err instanceof NetworkError) {
      const cached = await kvGet<ScholarshipList>(SCHOLARSHIPS_KEY);
      return cached ? { ...cached, stale: true } : null;
    }
    throw err;
  }
}

