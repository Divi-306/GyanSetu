import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useApp } from '@/stores/appStore';

/**
 * Where the API lives.
 * - A full URL (release builds, or to pin one in development) is used as is.
 * - "auto" (or empty) in development follows the PC's current LAN IP, taken from
 *   the Expo dev server the app was loaded from, so a new Wi-Fi IP never breaks it.
 */
function resolveApiUrl(): string {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
  if (configured && configured !== 'auto') return configured;
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0]; // e.g. "192.168.1.13:8081" → "192.168.1.13"
  const port = process.env.EXPO_PUBLIC_API_PORT ?? '4000';
  return __DEV__ && devHost ? `http://${devHost}:${port}` : '';
}

export const API_URL = resolveApiUrl();

const ACCESS = 'gs_access';
const REFRESH = 'gs_refresh';

/** The server answered with an error. `code` comes from the API's error envelope. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** The server could not be reached (offline, timeout, wrong URL). Callers fall back to local data. */
export class NetworkError extends Error {}

export type Session = {
  accessToken: string;
  refreshToken: string;
};

export async function saveSession(s: Session) {
  await SecureStore.setItemAsync(ACCESS, s.accessToken);
  await SecureStore.setItemAsync(REFRESH, s.refreshToken);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH);
}

export async function hasSession() {
  return (await SecureStore.getItemAsync(REFRESH)) !== null;
}

async function rawFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (!API_URL) throw new NetworkError('EXPO_PUBLIC_API_URL is not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
}

function getLanguageHeaders(): Record<string, string> {
  const language = useApp.getState().language || 'en';
  return {
    'Accept-Language': language,
    'X-Language': language,
  };
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH);
  if (!refreshToken) return false;
  const res = await rawFetch(
    '/v1/auth/refresh',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) },
    15_000,
  );
  if (res.ok) {
    await saveSession(await res.json());
    return true;
  }
  // Only a definitive answer from the server ends the session, never a network error.
  // Offline content stays usable either way.
  if (res.status === 401) await clearSession();
  return false;
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the access token (default true). */
  auth?: boolean;
  timeoutMs?: number;
};

export async function api<T>(path: string, opts: ApiOptions = {}, retry = true): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 20_000 } = opts;
  const token = auth ? await SecureStore.getItemAsync(ACCESS) : null;
  const res = await rawFetch(
    path,
    {
      method,
      headers: {
        Accept: 'application/json',
        ...getLanguageHeaders(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    timeoutMs,
  );

  if (res.status === 401 && auth && token && retry) {
    refreshing ??= refreshTokens().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, opts, false);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? 'Request failed',
      payload?.error?.details,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Liveness probe used for the online indicator: true only if the API answers quickly. */
export async function pingServer(timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await rawFetch('/health', { method: 'GET' }, timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}

/** A friendly, user-facing message for any error thrown by `api()`. */
export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return "Can't reach GyanSetu right now. Check your internet and try again.";
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details[0]?.message) {
      return String(err.details[0].message);
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
