import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { goBackOr } from '@/lib/nav';
import { resetPassword } from '@/services/account';

/** Opened from the email link gyansetu://reset-password?token=… */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token ?? '', password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Pressable style={styles.backButton} onPress={() => goBackOr('/login')}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back to Login</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>{done ? '✓' : '🔑'}</Text>
          </View>
          <Text style={styles.title}>{done ? 'Password updated' : 'Set a new password'}</Text>
          <Text style={styles.subtitle}>
            {done
              ? 'You can now log in with your new password on any device.'
              : !token
                ? 'This reset link is incomplete. Open the link from your email again, or request a new one.'
                : 'Choose a password with at least 8 characters.'}
          </Text>
        </View>

        {done ? (
          <Pressable style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>Go to Login</Text>
          </Pressable>
        ) : token ? (
          <>
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              placeholderTextColor="#9A9E9B"
            />
            <Text style={[styles.label, styles.labelSpaced]}>Confirm password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Type it again"
              placeholderTextColor="#9A9E9B"
              onSubmitEditing={handleSubmit}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Update Password</Text>}
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.button} onPress={() => router.replace('/forgot-password')}>
            <Text style={styles.buttonText}>Request a new link</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6F0' },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 55 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  backArrow: { fontSize: 32, lineHeight: 30, color: '#4F765C' },
  backText: { marginLeft: 5, fontSize: 14, fontWeight: '600', color: '#4F765C' },
  header: { alignItems: 'center', marginTop: 50, marginBottom: 32 },
  iconCircle: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#E4EEE5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  icon: { fontSize: 30, color: '#315C43' },
  title: { fontSize: 28, fontWeight: '700', color: '#173C31', textAlign: 'center' },
  subtitle: { marginTop: 12, fontSize: 15, lineHeight: 23, color: '#707872', textAlign: 'center', paddingHorizontal: 8 },
  label: { marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#34443B' },
  labelSpaced: { marginTop: 16 },
  input: {
    height: 54, borderWidth: 1, borderColor: '#D8DDD8', borderRadius: 14, backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, fontSize: 15, color: '#26352B',
  },
  errorText: { color: '#B3261E', fontSize: 13, marginTop: 12, lineHeight: 18 },
  button: {
    height: 54, borderRadius: 14, backgroundColor: '#5F8068',
    alignItems: 'center', justifyContent: 'center', marginTop: 22,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
