import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';
import type { ScreenItem } from './types';

type ScreenState = {
  items: ScreenItem[];
  courseId: string | null;
  set: (items: ScreenItem[], courseId: string | null) => void;
};

/** What the focused screen is showing. Screens publish it with useNavigatorScreen. */
export const useNavigatorScreen = create<ScreenState>((set) => ({
  items: [],
  courseId: null,
  set: (items, courseId) => set({ items, courseId }),
}));

/**
 * Lets the AI Navigator understand "open the first one" and "start the next
 * lesson" on this screen. Pass a memoised list; it is published while the
 * screen is focused and cleared when it loses focus.
 */
export function usePublishScreen(items: ScreenItem[], courseId: string | null = null) {
  useFocusEffect(
    useCallback(() => {
      useNavigatorScreen.getState().set(items, courseId);
      return () => useNavigatorScreen.getState().set([], null);
    }, [items, courseId]),
  );
}
