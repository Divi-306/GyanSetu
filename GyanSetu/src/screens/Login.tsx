import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { goBackOr } from '@/lib/nav';
import { login, signup } from '@/services/account';
import { useTranslation } from '@/i18n';
import { useApp } from '@/stores/appStore';

type LoginProps = {
  mode?: 'login' | 'signup';
};

export default function Login({ mode = 'login' }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  const { t } = useTranslation();
  const pendingSyncCount = useApp((s) => s.pendingSyncCount);

  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const id = identifier.trim();
    if (!id || !password) {
      setError(t('auth.invalidCredentials'));
      return;
    }
    if (isSignUp && name.trim().length < 2) {
      setError(t('auth.nameRequired'));
      return;
    }
    if (isSignUp && password.length < 8) {
      setError(t('auth.passwordLength'));
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
        const isEmail = id.includes('@');
        await signup({
          name: name.trim(),
          password,
          ...(isEmail ? { email: id } : { phone: id }),
        });
      } else {
        await login(id, password);
      }
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {/* Back */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => goBackOr('/')}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>🌿</Text>
          </View>

          <Text style={styles.brandName}>
            GyanSetu
          </Text>

          <Text style={styles.tagline}>
            {t('auth.offlinePrompt')}
          </Text>
        </View>

        {/* Heading */}
        <Text style={styles.title}>
          {isSignUp
            ? t('auth.createAccountTitle')
            : t('auth.welcomeBack')}
        </Text>

        <Text style={styles.subtitle}>
          {isSignUp
            ? t('auth.createAccountSubtitle')
            : t('auth.continueJourney')}
        </Text>

        {/* Form */}
        <View style={styles.form}>
          {isSignUp && (
            <>
              <Text style={styles.label}>
                {t('auth.fullName')}
              </Text>

              <TextInput
                style={styles.input}
                placeholder={t('auth.namePlaceholder')}
                placeholderTextColor="#9AA39C"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
              />
            </>
          )}

          <Text style={styles.label}>
            {t('auth.identifier')}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={t('auth.identifierPlaceholder')}
            placeholderTextColor="#9AA39C"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
          />

          <Text style={styles.label}>
            {t('auth.password')}
          </Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={isSignUp ? t('auth.passwordLength') : t('auth.passwordPlaceholder')}
              placeholderTextColor="#9AA39C"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              onSubmitEditing={handleSubmit}
            />

            <TouchableOpacity
              onPress={() =>
                setShowPassword(!showPassword)
              }
            >
              <Text style={styles.showText}>
                {showPassword
                  ? t('auth.hide')
                  : t('auth.show')}
              </Text>
            </TouchableOpacity>
          </View>

          {!isSignUp && (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => router.push('/forgot-password')}
            >
              <Text style={styles.forgotText}>
                {t('auth.forgotPassword')}
              </Text>
            </TouchableOpacity>
          )}

          {error && (
            <Text style={styles.errorText}>
              {error}
            </Text>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.primaryButtonBusy]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isSignUp
                  ? t('auth.createAccountAction')
                  : t('auth.loginAction')}
              </Text>
            )}
          </TouchableOpacity>

          {pendingSyncCount > 0 && (
            <Text style={styles.syncNote}>
              {t('auth.pendingOfflineChanges', { count: pendingSyncCount })}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.divider} />

          <Text style={styles.dividerText}>
            {t('auth.or')}
          </Text>

          <View style={styles.divider} />
        </View>

        {/* Offline */}
        <TouchableOpacity
          style={styles.offlineCard}
          onPress={() => router.replace('/dashboard')}
          activeOpacity={0.85}
        >
          <View style={styles.offlineIcon}>
            <Text>📱</Text>
          </View>

          <View style={styles.offlineContent}>
            <Text style={styles.offlineTitle}>
              {t('auth.continueOffline')}
            </Text>

            <Text style={styles.offlineSubtitle}>
              {t('auth.continueOfflineAccountDescription')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Switch */}
        <View style={styles.switchContainer}>
          <Text style={styles.switchText}>
            {isSignUp
              ? t('auth.alreadyHaveAccount')
              : t('auth.noAccount')}
          </Text>

          <TouchableOpacity
            onPress={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
          >
            <Text style={styles.switchAction}>
              {isSignUp
                ? ` ${t('auth.loginAction')}`
                : ` ${t('auth.createAccountAction')}`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {t('auth.learningDataOffline')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: '#B3261E',
    fontSize: 13,
    marginTop: 14,
    lineHeight: 18,
  },

  primaryButtonBusy: {
    opacity: 0.7,
  },

  syncNote: {
    color: '#5F6B63',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFDF8',
  },

  content: {
    padding: 22,
    paddingBottom: 45,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F2F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  backText: {
    fontSize: 32,
    lineHeight: 34,
    color: '#315C43',
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },

  logoCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E6EFE1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },

  logoIcon: {
    fontSize: 27,
  },

  brandName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#315C43',
    marginBottom: 5,
  },

  tagline: {
    fontSize: 10,
    color: '#879189',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 15,
  },

  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 7,
  },

  subtitle: {
    fontSize: 13,
    color: '#78837B',
    lineHeight: 19,
    marginBottom: 25,
  },

  form: {
    width: '100%',
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#304137',
    marginBottom: 7,
    marginTop: 7,
  },

  input: {
    height: 51,
    borderWidth: 1,
    borderColor: '#DDE4DA',
    borderRadius: 14,
    paddingHorizontal: 15,
    backgroundColor: '#FFFFFF',
    color: '#26382D',
    fontSize: 14,
  },

  passwordContainer: {
    height: 51,
    borderWidth: 1,
    borderColor: '#DDE4DA',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 14,
  },

  passwordInput: {
    flex: 1,
    color: '#26382D',
    fontSize: 14,
  },

  showText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#315C43',
  },

  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
  },

  forgotText: {
    fontSize: 12,
    color: '#315C43',
    fontWeight: '600',
  },

  primaryButton: {
    height: 52,
    backgroundColor: '#315C43',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E9E2',
  },

  dividerText: {
    fontSize: 10,
    color: '#A0A8A1',
    marginHorizontal: 12,
  },

  offlineCard: {
    backgroundColor: '#F3F7EF',
    borderRadius: 17,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  offlineIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#DCE9D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  offlineContent: {
    flex: 1,
    marginLeft: 12,
  },

  offlineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#315C43',
    marginBottom: 4,
  },

  offlineSubtitle: {
    fontSize: 10,
    lineHeight: 16,
    color: '#748078',
  },

  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },

  switchText: {
    fontSize: 12,
    color: '#7A847D',
  },

  switchAction: {
    fontSize: 12,
    color: '#315C43',
    fontWeight: '700',
  },

  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: '#A0A7A1',
    lineHeight: 15,
    marginTop: 24,
  },
});