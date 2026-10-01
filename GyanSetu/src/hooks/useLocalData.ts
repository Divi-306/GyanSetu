import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/stores/appStore';

/**
 * Reads local (SQLite) data and re-reads it when the screen regains focus or
 * when local learning data changes (a sync, a download, a completed lesson).
 * `key` identifies what is loaded (e.g. a lesson id); a new key reloads.
 */
export function useLocalData<T>(load: () => Promise<T>, key = '') {
  const dataVersion = useApp((s) => s.dataVersion);
  const [data, setData] = useState<T | undefined>(undefined);
  const [focusCount, setFocusCount] = useState(0);
  const loadRef = useRef(load);
  const firstFocus = useRef(true);

  useEffect(() => {
    loadRef.current = load;
  });

  useFocusEffect(
    useCallback(() => {
      // The mount already loads; only refocusing (coming back to the screen) needs a reload.
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setFocusCount((n) => n + 1);
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => console.warn('[useLocalData]', err));
    return () => {
      cancelled = true;
    };
  }, [key, dataVersion, focusCount]);

  return { data };
}
