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
} from 'react-native';

type LoginProps = {
  onBack: () => void;
  onSignUp: () => void;
  onLoginSuccess?: (user: {
    name: string;
    email: string;
  }) => void;
};

export default function Login({
  onBack,
  onSignUp,
  onLoginSuccess,
}: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const handleSubmit = () => {
    const userName =
      name.trim() || 'Student';

    const userEmail =
      email.trim() || 'student@example.com';

    if (onLoginSuccess) {
      onLoginSuccess({
        name: userName,
        email: userEmail,
      });
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
          onPress={onBack}
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
            Learning continues, even when connectivity
            doesn't.
          </Text>
        </View>

        {/* Heading */}
        <Text style={styles.title}>
          {isSignUp
            ? 'Create your account'
            : 'Welcome back'}
        </Text>

        <Text style={styles.subtitle}>
          {isSignUp
            ? 'Start your learning journey with GyanSetu.'
            : 'Continue your learning journey.'}
        </Text>

        {/* Form */}
        <View style={styles.form}>
          {isSignUp && (
            <>
              <Text style={styles.label}>
                Full Name
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#9AA39C"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.label}>
            Email
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#9AA39C"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>
            Password
          </Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#9AA39C"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={() =>
                setShowPassword(!showPassword)
              }
            >
              <Text style={styles.showText}>
                {showPassword
                  ? 'Hide'
                  : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          {!isSignUp && (
            <TouchableOpacity
              style={styles.forgotButton}
            >
              <Text style={styles.forgotText}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {isSignUp
                ? 'Create Account'
                : 'Login'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.divider} />

          <Text style={styles.dividerText}>
            OR
          </Text>

          <View style={styles.divider} />
        </View>

        {/* Offline */}
        <View style={styles.offlineCard}>
          <View style={styles.offlineIcon}>
            <Text>📱</Text>
          </View>

          <View style={styles.offlineContent}>
            <Text style={styles.offlineTitle}>
              Continue offline
            </Text>

            <Text style={styles.offlineSubtitle}>
              Already logged in on this device?
              Your downloaded learning can continue
              without internet.
            </Text>
          </View>
        </View>

        {/* Switch */}
        <View style={styles.switchContainer}>
          <Text style={styles.switchText}>
            {isSignUp
              ? 'Already have an account?'
              : "Don't have an account?"}
          </Text>

          <TouchableOpacity
            onPress={() => {
              setIsSignUp(!isSignUp);
              onSignUp();
            }}
          >
            <Text style={styles.switchAction}>
              {isSignUp
                ? ' Login'
                : ' Create Account'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Your learning data stays available
          offline on this device.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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