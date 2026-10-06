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
import { errorMessage } from '@/lib/api';
import { goBackOr } from '@/lib/nav';
import { requestPasswordReset } from '@/services/account';
import { useTranslation } from '@/i18n';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onBack = () => goBackOr('/login');

  const handleReset = async () => {
    if (!email.trim() || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // The server answers the same way whether or not the account exists.
      await requestPasswordReset(email);
      setSent(true);
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

        {/* Back */}
        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backArrow}>‹</Text>

          <Text style={styles.backText}>
            {t('auth.backToLogin')}
          </Text>
        </Pressable>

        {!sent ? (
          <>
            {/* Header */}
            <View style={styles.header}>

              <View style={styles.iconCircle}>
                <Text style={styles.lockIcon}>
                  🔐
                </Text>
              </View>

              <Text style={styles.title}>
                {t('auth.forgotPasswordTitle')}
              </Text>

              <Text style={styles.subtitle}>
                {t('auth.forgotPasswordDescription')}
              </Text>

            </View>

            {/* Email */}
            <Text style={styles.label}>
              {t('auth.identifier')}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={t('auth.identifierPlaceholder')}
              placeholderTextColor="#9A9E9B"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />

            {/* Reset */}
            {error && (
              <Text style={styles.errorText}>
                {error}
              </Text>
            )}

            <Pressable
              style={[
                styles.resetButton,
                (!email.trim() || busy) && styles.disabledButton,
              ]}
              onPress={handleReset}
              disabled={!email.trim() || busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.resetText}>
                  {t('auth.sendResetLink')}
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          /* Success */
          <View style={styles.successContainer}>

            <View style={styles.successCircle}>
              <Text style={styles.check}>
                ✓
              </Text>
            </View>

            <Text style={styles.successTitle}>
              {t('auth.checkInbox')}
            </Text>

            <Text style={styles.successText}>
              {t('auth.resetInstructions')}
            </Text>

            <Pressable
              style={styles.tryAgainButton}
              onPress={() => setSent(false)}
            >
              <Text style={styles.tryAgainText}>
                {t('auth.tryAnotherEmail')}
              </Text>
            </Pressable>

          </View>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: '#B3261E',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
  },

  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 55,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },

  backArrow: {
    fontSize: 32,
    lineHeight: 30,
    color: '#4F765C',
  },

  backText: {
    marginLeft: 5,
    fontSize: 14,
    fontWeight: '600',
    color: '#4F765C',
  },

  header: {
    alignItems: 'center',
    marginTop: 65,
    marginBottom: 38,
  },

  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E4EEE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  lockIcon: {
    fontSize: 30,
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#173C31',
    textAlign: 'center',
  },

  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 23,
    color: '#707872',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#34443B',
  },

  input: {
    height: 54,
    borderWidth: 1,
    borderColor: '#D8DDD8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#26352B',
  },

  resetButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#5F8068',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  disabledButton: {
    opacity: 0.5,
  },

  resetText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -40,
  },

  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4EEE5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  check: {
    fontSize: 32,
    color: '#4F765C',
    fontWeight: '700',
  },

  successTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '700',
    color: '#173C31',
  },

  successText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: '#707872',
    textAlign: 'center',
    paddingHorizontal: 15,
  },

  tryAgainButton: {
    marginTop: 22,
  },

  tryAgainText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F765C',
  },
});