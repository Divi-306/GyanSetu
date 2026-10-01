import { Redirect } from 'expo-router';
import Home from '@/screens/Home';
import { useApp } from '@/stores/appStore';

export default function Index() {
  const status = useApp((s) => s.sessionStatus);
  if (status === 'loading') return null;
  // Logged-in students skip the welcome screen; guests see it every launch.
  if (status === 'authed') return <Redirect href="/dashboard" />;
  return <Home />;
}
