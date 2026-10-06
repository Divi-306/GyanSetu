import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { migrate } from '@/db';
import { NetworkError, pingServer } from '@/lib/api';
import { useApp } from '@/stores/appStore';
import { restoreSession } from './account';
import { backgroundCareerRefresh } from './career';
import { evictStaleCachedPacks, refreshPackStatus } from './learningPacks';
import { configureNotifications, rescheduleReminder } from './reminders';
import { runStorageMaintenance } from './storage';
import { importBundledStarter, refreshCatalog, refreshStarterPack } from './packs';
import { flush, loadSyncState, syncNow } from './sync';

/** Everything the first screen needs, all local: works with no internet on first launch. */
export async function initApp() {
  await migrate();
  await importBundledStarter();
  await loadSyncState();
  await evictStaleCachedPacks().catch((err) => console.warn('[bootstrap] evict', err));
  configureNotifications();
  // Never blocks the first screen; it only compresses optional data and raises notices.
  void runStorageMaintenance().catch((err) => console.warn('[bootstrap] storage', err));
  // Restores from the cached user immediately; refreshes from the server in the background.
  void restoreSession();
  useApp.getState().setReady();
}

const PROBE_INTERVAL_MS = 60_000;

/** Probe the API, and when it's reachable push/pull data and refresh the catalog. */
async function onPossiblyOnline() {
  const reachable = await pingServer();
  useApp.getState().setConnectivity({ serverReachable: reachable });
  if (!reachable) return;
  const background = (p: Promise<unknown>) =>
    p.catch((err) => {
      if (!(err instanceof NetworkError)) console.warn('[bootstrap]', err);
    });
  await Promise.all([
    // Library deletions from other devices are applied after the pull.
    background(syncNow().then(refreshPackStatus)),
    background(refreshCatalog()),
    background(refreshStarterPack()),
    background(backgroundCareerRefresh()),
  ]);
}

/** Starts connectivity tracking. Returns a cleanup function. */
export function startConnectivity() {
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const connected = state.isConnected === true;
    const wasConnected = useApp.getState().isConnected;
    useApp.getState().setConnectivity({ isConnected: connected, ...(connected ? {} : { serverReachable: false }) });
    if (connected && !wasConnected) void onPossiblyOnline();
  });

  const appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      void runStorageMaintenance().catch((err) => console.warn('[storage]', err));
      if (useApp.getState().isConnected) void onPossiblyOnline();
    }
    // Leaving the app: schedule the next reminder from this session's progress.
    if (s === 'background') void rescheduleReminder().catch((err) => console.warn('[reminders]', err));
  });

  // While unreachable, keep probing; once reachable, only push queued changes.
  const timer = setInterval(() => {
    const { isConnected, serverReachable } = useApp.getState();
    if (!isConnected) return;
    if (serverReachable) void flush();
    else void onPossiblyOnline();
  }, PROBE_INTERVAL_MS);

  void onPossiblyOnline();

  return () => {
    unsubscribeNet();
    appStateSub.remove();
    clearInterval(timer);
  };
}
