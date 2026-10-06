import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { selectOnline, useApp } from '@/stores/appStore';

export default function Home() {
  // "Online" means the GyanSetu server answered, not just that Wi-Fi is on.
  const isOnline = useApp(selectOnline);
  const { t } = useTranslation();
  const onLogin = () => router.push('/login');
  const onSignUp = () => router.push('/signup');
  const onContinueOffline = () => router.replace('/dashboard');

  return (
    <View style={styles.container}>

      <View style={styles.topDecoration}>
        <View style={styles.curveOne} />
        <View style={styles.curveTwo} />
        <View style={styles.leafOne} />
        <View style={styles.leafTwo} />
      </View>

      {/* Logo */}
      <View style={styles.logoSection}>
        <Image
          source={require('../../assets/gyansetu-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>
          GyanSetu
        </Text>

        <Text style={styles.tagline}>
          {t('auth.offlinePrompt')}
        </Text>
      </View>

      {/* Status */}
      <View
        style={[
          styles.statusBox,
          isOnline
            ? styles.onlineBox
            : styles.offlineBox,
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isOnline
                ? '#3B8D5A'
                : '#D79A35',
            },
          ]}
        />

        <Text style={styles.statusText}>
          {isOnline
            ? t('auth.accountNotice')
            : t('auth.offlineNotice')}
        </Text>
      </View>

      {/* Welcome */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeTitle}>
          {t('auth.welcome')}
        </Text>

        <Text style={styles.description}>
          {t('auth.welcomeDescription')}
        </Text>
      </View>

      {/* Continue Offline */}
      <Pressable
        style={styles.offlineCard}
        onPress={onContinueOffline}
      >
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>
            ↓
          </Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>
            {t('auth.continueOffline')}
          </Text>

          <Text style={styles.cardDescription}>
            {t('auth.continueOfflineDescription')}
          </Text>
        </View>

        <Text style={styles.cardArrow}>
          →
        </Text>
      </Pressable>

      {/* OR */}
      <View style={styles.dividerRow}>
        <View style={styles.divider} />

        <Text style={styles.orText}>
          {t('auth.or')}
        </Text>

        <View style={styles.divider} />
      </View>

      {/* Login */}
      <Pressable
        style={styles.loginButton}
        onPress={onLogin}
      >
        <Text style={styles.loginText}>
          {t('auth.loginAction')}
        </Text>

        <Text style={styles.loginArrow}>
          →
        </Text>
      </Pressable>

      {/* Sign Up */}
      <Pressable
        style={styles.signupButton}
        onPress={onSignUp}
      >
        <Text style={styles.signupText}>
          {t('common.createAccount')}
        </Text>
      </Pressable>

      <Text style={styles.footer}>
        {t('auth.yourLearning')}
      </Text>

      <View style={styles.bottomDecoration}>
        <View style={styles.bottomCurve} />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
    paddingHorizontal: 26,
    paddingTop: 55,
  },

  topDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 170,
    overflow: 'hidden',
  },

  curveOne: {
    position: 'absolute',
    width: 300,
    height: 180,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#B2C6AD',
    borderRadius: 160,
    top: -105,
    left: -100,
    transform: [{ rotate: '-12deg' }],
  },

  curveTwo: {
    position: 'absolute',
    width: 230,
    height: 130,
    borderBottomWidth: 1,
    borderColor: '#CBD8C7',
    borderRadius: 130,
    top: -65,
    left: -45,
    transform: [{ rotate: '-18deg' }],
  },

  leafOne: {
    position: 'absolute',
    width: 15,
    height: 28,
    backgroundColor: '#B8CCB2',
    borderRadius: 20,
    top: 85,
    left: 48,
    transform: [{ rotate: '35deg' }],
  },

  leafTwo: {
    position: 'absolute',
    width: 13,
    height: 24,
    backgroundColor: '#AFC5A9',
    borderRadius: 20,
    top: 65,
    right: 55,
    transform: [{ rotate: '-35deg' }],
  },

  logoSection: {
    alignItems: 'center',
    marginTop: 45,
  },

  logo: {
    width: 125,
    height: 125,
  },

  title: {
    fontSize: 38,
    fontWeight: '700',
    color: '#173C31',
    marginTop: -8,
  },

  tagline: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: '#707872',
    textAlign: 'center',
  },

  statusBox: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 18,
  },

  onlineBox: {
    backgroundColor: '#E6F2E8',
  },

  offlineBox: {
    backgroundColor: '#F7EBD5',
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#526158',
  },

  welcomeSection: {
    alignItems: 'center',
    marginTop: 24,
  },

  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#173C31',
  },

  description: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#737A74',
    textAlign: 'center',
    paddingHorizontal: 15,
  },

  offlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 78,
    marginTop: 23,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#EAF3E9',
    borderWidth: 1,
    borderColor: '#D2E3D0',
  },

  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D4E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardIconText: {
    fontSize: 25,
    color: '#3F7850',
  },

  cardContent: {
    flex: 1,
    marginLeft: 12,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#244C34',
  },

  cardDescription: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: '#66756A',
  },

  cardArrow: {
    fontSize: 22,
    color: '#4F765C',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#D5D9D4',
  },

  orText: {
    marginHorizontal: 12,
    fontSize: 11,
    color: '#8A908B',
  },

  loginButton: {
    height: 53,
    borderRadius: 15,
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
    color: '#FFFFFF',
    fontSize: 21,
    marginLeft: 10,
  },

  signupButton: {
    height: 53,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#5F8068',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  signupText: {
    color: '#4F765C',
    fontSize: 15,
    fontWeight: '700',
  },

  footer: {
    position: 'absolute',
    bottom: 31,
    alignSelf: 'center',
    fontSize: 11,
    color: '#8A998C',
  },

  bottomDecoration: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 85,
    overflow: 'hidden',
  },

  bottomCurve: {
    position: 'absolute',
    width: 330,
    height: 130,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#C2D1BE',
    borderRadius: 160,
    bottom: -90,
    right: -90,
    transform: [{ rotate: '-10deg' }],
  },
});