import { create } from 'zustand';

export type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferredLanguage: 'en' | 'hi';
  role: string;
};

type SessionStatus = 'loading' | 'guest' | 'authed';

type AppState = {
  /** Local DB migrated and starter pack imported. Screens render only after this. */
  ready: boolean;
  sessionStatus: SessionStatus;
  user: User | null;

  /** Device has a network connection (NetInfo). */
  isConnected: boolean;
  /** The API answered /health recently. */
  serverReachable: boolean;

  syncing: boolean;
  pendingSyncCount: number;
  lastSyncAt: string | null;

  /** Bumped whenever local learning data changes, so screens re-read SQLite. */
  dataVersion: number;

  setReady: () => void;
  setSession: (user: User | null) => void;
  setConnectivity: (patch: Partial<Pick<AppState, 'isConnected' | 'serverReachable'>>) => void;
  setSync: (patch: Partial<Pick<AppState, 'syncing' | 'pendingSyncCount' | 'lastSyncAt'>>) => void;
  bumpData: () => void;
};

export const useApp = create<AppState>((set) => ({
  ready: false,
  sessionStatus: 'loading',
  user: null,
  isConnected: true,
  serverReachable: false,
  syncing: false,
  pendingSyncCount: 0,
  lastSyncAt: null,
  dataVersion: 0,

  setReady: () => set({ ready: true }),
  setSession: (user) => set({ user, sessionStatus: user ? 'authed' : 'guest' }),
  setConnectivity: (patch) => set(patch),
  setSync: (patch) => set(patch),
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));

/** Online for our purposes = connected AND the API is reachable. */
export const selectOnline = (s: AppState) => s.isConnected && s.serverReachable;
