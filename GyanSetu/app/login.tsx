import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type LoginProps = {
  onBack: () => void;
  onSignUp: () => void;
};

export default function Login({
  onBack,
  onSignUp,
}: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      return;
    }

    // Authentication will be connected later.
    console.log('Login:', email);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>

        {/* Back to Entry */}
        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../assets/gyansetu-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.brandName}>
            GyanSetu
          </Text>
        </View>

        {/* Heading */}
        <Text style={styles.title}>
          Welcome Back
        </Text>

        <Text style={styles.subtitle}>
          Continue your learning journey
        </Text>

        {/* Email */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            Email or Phone
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>
              ✉
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your email or phone"
              placeholderTextColor="#999E99"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            Password
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>
              🔒
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#999E99"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />

            <Pressable
              onPress={() =>
                setShowPassword(!showPassword)
              }
            >
              <Text style={styles.eye}>
                {showPassword ? '◉' : '◌'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Forgot Password */}
        <Pressable style={styles.forgotButton}>
          <Text style={styles.forgotText}>
            Forgot Password?
          </Text>
        </Pressable>

        {/* Login */}
        <Pressable
          style={styles.loginButton}
          onPress={handleLogin}
        >
          <Text style={styles.loginText}>
            Login
          </Text>

          <Text style={styles.loginArrow}>
            →
          </Text>
        </Pressable>

        {/* OR */}
        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.line} />
        </View>

        {/* Google */}
        <Pressable style={styles.googleButton}>
          <Text style={styles.googleG}>
            G
          </Text>

          <Text style={styles.googleText}>
            Continue with Google
          </Text>
        </Pressable>

        {/* Sign Up */}
        <View style={styles.signupRow}>
          <Text style={styles.signupQuestion}>
            Don't have an account?
          </Text>

          <Pressable onPress={onSignUp}>
            <Text style={styles.signupText}>
              {' '}Sign Up
            </Text>
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
    paddingHorizontal: 26,
    paddingTop: 45,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },

  backArrow: {
    fontSize: 30,
    color: '#4F765C',
    lineHeight: 30,
  },

  backText: {
    marginLeft: 4,
    fontSize: 13,
    color: '#4F765C',
    fontWeight: '600',
  },

  logoSection: {
    alignItems: 'center',
    marginTop: 8,
  },

  logo: {
    width: 72,
    height: 72,
  },

  brandName: {
    marginTop: -5,
    fontSize: 25,
    fontWeight: '700',
    color: '#173C31',
  },

  title: {
    marginTop: 20,
    fontSize: 30,
    fontWeight: '700',
    color: '#173C31',
    textAlign: 'center',
  },

  subtitle: {
    marginTop: 6,
    marginBottom: 25,
    fontSize: 14,
    color: '#707872',
    textAlign: 'center',
  },

  fieldContainer: {
    marginBottom: 16,
  },

  label: {
    marginBottom: 7,
    fontSize: 14,
    fontWeight: '600',
    color: '#27362E',
  },

  inputContainer: {
    height: 53,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D6DAD5',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
  },

  inputIcon: {
    width: 24,
    fontSize: 17,
    color: '#68736B',
  },

  input: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: '#26352B',
    paddingHorizontal: 8,
  },

  eye: {
    fontSize: 19,
    color: '#68736B',
    paddingHorizontal: 4,
  },

  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -5,
    marginBottom: 18,
  },

  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F765C',
  },

  loginButton: {
    height: 53,
    borderRadius: 14,
    backgroundColor: '#5F8068',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loginText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  loginArrow: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 21,
  },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 17,
  },

  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#D8DCD7',
  },

  orText: {
    marginHorizontal: 12,
    fontSize: 11,
    color: '#858B86',
  },

  googleButton: {
    height: 53,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D6DAD5',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  googleG: {
    fontSize: 19,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 10,
  },

  googleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#303631',
  },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },

  signupQuestion: {
    fontSize: 13,
    color: '#707872',
  },

  signupText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F765C',
  },
});