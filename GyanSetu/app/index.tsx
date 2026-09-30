import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Please enter your email and password.');
      return;
    }

    Alert.alert('Login', 'Authentication will be connected next.');
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password',
      'Password recovery will be connected with the backend next.'
    );
  };

  const handleSignUp = () => {
    Alert.alert(
      'Create Account',
      'Sign up screen will be added next.'
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>

        {/* Header */}
        <Text style={styles.title}>Welcome Back</Text>

        <Text style={styles.subtitle}>
          Continue your learning journey.
        </Text>

        {/* Email */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Email or Phone</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your email or phone"
            placeholderTextColor="#9A9E9B"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        {/* Password */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Password</Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#9A9E9B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />

            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Text style={styles.eyeText}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Forgot Password */}
        <Pressable
          onPress={handleForgotPassword}
          style={styles.forgotButton}
        >
          <Text style={styles.forgotText}>
            Forgot Password?
          </Text>
        </Pressable>

        {/* Login */}
        <Pressable
          onPress={handleLogin}
          style={styles.loginButton}
        >
          <Text style={styles.loginText}>Login</Text>
        </Pressable>

        {/* Sign Up */}
        <View style={styles.signupRow}>
          <Text style={styles.signupQuestion}>
            Don't have an account?
          </Text>

          <Pressable onPress={handleSignUp}>
            <Text style={styles.signupText}> Sign Up</Text>
          </Pressable>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#173C31',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  subtitle: {
    marginTop: 9,
    marginBottom: 34,
    fontSize: 16,
    color: '#707872',
    textAlign: 'center',
  },

  fieldContainer: {
    marginBottom: 18,
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

  passwordContainer: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8DDD8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },

  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#26352B',
  },

  eyeButton: {
    paddingHorizontal: 15,
  },

  eyeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F8068',
  },

  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -5,
    marginBottom: 22,
  },

  forgotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F765C',
  },

  loginButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#5F8068',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  loginText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 25,
  },

  signupQuestion: {
    fontSize: 14,
    color: '#707872',
  },

  signupText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F765C',
  },
});