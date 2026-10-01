import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initApp, startConnectivity } from '@/services/bootstrap';
import { useApp } from '@/stores/appStore';

export default function RootLayout() {
  const ready = useApp((s) => s.ready);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initApp().catch((err) => {
      console.error('[init]', err);
      setError('GyanSetu could not open its offline storage. Restart the app.');
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    return startConnectivity();
  }, [ready]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {ready ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: styles.screen, animation: 'slide_from_right' }} />
        ) : (
          <View style={styles.splash}>
            {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#315C43" />}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F6F0' },
  screen: { backgroundColor: '#F8F6F0' },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#B3261E', textAlign: 'center', fontSize: 14, lineHeight: 20 },
});
