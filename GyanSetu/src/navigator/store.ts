import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';
import type { ScreenItem } from './types';

type ScreenState = {
  items: ScreenItem[];
  packId: string | null;
  set: (items: ScreenItem[], packId: string | null) => void;
};

/** What the focused screen is showing. Screens publish it with useNavigatorScreen. */
export const useNavigatorScreen = create<ScreenState>((set) => ({
  items: [],
  packId: null,
  set: (items, packId) => set({ items, packId }),
}));

/**
 * Lets the AI Navigator understand "open the first one" and "start the next
 * lesson" on this screen. Pass a memoised list; it is published while the
 * screen is focused and cleared when it loses focus.
 */
export function usePublishScreen(items: ScreenItem[], packId: string | null = null) {
  useFocusEffect(
    useCallback(() => {
      useNavigatorScreen.getState().set(items, packId);
      return () => useNavigatorScreen.getState().set([], null);
    }, [items, packId]),
  );
}
