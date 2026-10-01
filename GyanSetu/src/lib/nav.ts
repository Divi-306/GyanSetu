import { router, type Href } from 'expo-router';

/** Back if there is history (e.g. not opened from a deep link), otherwise go to `fallback`. */
export function goBackOr(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
