import React, { useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useLocalData } from '@/hooks/useLocalData';
import { errorMessage } from '@/lib/api';
import { formatBytes, timeAgo } from '@/lib/format';
import { goBackOr } from '@/lib/nav';
import { deleteAccount, logout, pendingChanges, updateUser } from '@/services/account';
import { getProgressOverview } from '@/services/analytics';
import { listMyPacks } from '@/services/learningPacks';
import { syncNow } from '@/services/sync';
import { selectOnline, useApp } from '@/stores/appStore';

async function loadProfileData() {
  const stats = await getProgressOverview();
  const onDevice = (await listMyPacks()).filter((p) => p.onDevice);
  const packBytes = onDevice.reduce((sum, p) => sum + p.sizeBytes, 0);
  return { stats, packCount: onDevice.length, packBytes, freeBytes: Paths.availableDiskSpace };
}

export default function Profile() {
  const user = useApp((s) => s.user);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const online = useApp(selectOnline);
  const { syncing, pendingSyncCount, lastSyncAt } = useApp();
  const { data } = useLocalData(loadProfileData);
  const [busy, setBusy] = useState(false);

  const stats = data?.stats;

  const syncLabel = syncing
    ? '● Syncing…'
    : pendingSyncCount > 0
      ? `● ${pendingSyncCount} change${pendingSyncCount === 1 ? '' : 's'} waiting to sync`
      : authed
        ? '● All changes synced'
        : '● All changes saved locally';

  const syncHint = !authed
    ? 'Log in to back up your progress and continue on another phone.'
    : lastSyncAt
      ? `Last synced ${timeAgo(lastSyncAt)}.${online ? '' : ' Will sync when you are online.'}`
      : 'Your progress will sync when internet connection is available.';

  const toggleLanguage = async () => {
    if (!authed || !user) return;
    try {
      await updateUser({ preferredLanguage: user.preferredLanguage === 'hi' ? 'en' : 'hi' });
    } catch (err) {
      Alert.alert('Could not change language', errorMessage(err));
    }
  };

  const doLogout = async () => {
    setBusy(true);
    try {
      await logout();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const confirmLogout = async () => {
    const pending = await pendingChanges();
    if (pending === 0) return doLogout();
    Alert.alert(
      'Unsynced progress',
      `${pending} change${pending === 1 ? ' has' : 's have'} not been saved to your account yet. Logging out now will remove ${pending === 1 ? 'it' : 'them'} from this phone. Connect to the internet first to keep ${pending === 1 ? 'it' : 'them'}.`,
      [
        { text: 'Stay logged in', style: 'cancel' },
        { text: 'Log out anyway', style: 'destructive', onPress: () => void doLogout() },
      ],
    );
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, profile and all your progress from GyanSetu. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/');
            } catch (err) {
              Alert.alert('Could not delete account', errorMessage(err));
            }
          },
        },
      ],
    );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => goBackOr('/dashboard')}
          >
            <Text style={styles.backText}>
              ‹
            </Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            Profile
          </Text>

          <View style={{ width: 42 }} />
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              👤
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {user?.name || 'Student'}
            </Text>

            <Text style={styles.email}>
              {user ? user.email ?? user.phone : 'Offline learner'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(authed ? '/profile/edit' : '/login')}
          >
            <Text style={styles.editText}>
              {authed ? 'Edit' : 'Log in'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Learning Overview */}
        <Text style={styles.sectionTitle}>
          Learning Overview
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.packs.length ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              Learning packs
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.topicsCompleted ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              Topics done
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.overallPercent ?? 0}%
            </Text>

            <Text style={styles.statLabel}>
              Progress
            </Text>
          </View>
        </View>

        {/* Offline Learning */}
        <Text style={styles.sectionTitle}>
          Offline Learning
        </Text>

        <TouchableOpacity style={styles.infoCard} onPress={() => router.push('/packs')}>
          <View style={styles.infoIcon}>
            <Text>📥</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Downloaded Learning Packs
            </Text>

            <Text style={styles.infoSubtitle}>
              {data?.packCount
                ? `${data.packCount} pack${data.packCount === 1 ? '' : 's'} • ${formatBytes(data.packBytes)}`
                : 'No packs downloaded yet. Create one to learn offline.'}
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoCard} onPress={() => router.push('/storage')}>
          <View style={styles.infoIcon}>
            <Text>💾</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Offline Storage
            </Text>

            <Text style={styles.infoSubtitle}>
              {formatBytes(data?.freeBytes)} free • manage packs, videos and compression
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        {/* Learning */}
        <Text style={styles.sectionTitle}>
          My Learning
        </Text>

        {[
          { icon: '📈', title: 'Learning Progress', subtitle: 'Streaks, study time, strong and weak areas', href: '/progress' as const },
          { icon: '💼', title: 'Career Guidance', subtitle: 'Paths and a roadmap based on what you learn', href: '/career' as const },
          { icon: '🔔', title: 'Learning reminders', subtitle: 'Friendly nudges, frequency and quiet hours', href: '/settings/reminders' as const },
          { icon: '🔒', title: 'Privacy & data', subtitle: 'What is stored, clear your learning history', href: '/settings/privacy' as const },
        ].map((item) => (
          <TouchableOpacity key={item.href} style={styles.infoCard} onPress={() => router.push(item.href)}>
            <View style={styles.infoIcon}>
              <Text>{item.icon}</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>{item.title}</Text>
              <Text style={styles.infoSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Sync */}
        <Text style={styles.sectionTitle}>
          Sync & Connectivity
        </Text>

        <TouchableOpacity
          style={styles.syncCard}
          disabled={!authed || !online || syncing}
          onPress={() => void syncNow()}
        >
          <View style={styles.syncIcon}>
            <Text>☁️</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Sync Status{authed && online && !syncing ? ' • Tap to sync now' : ''}
            </Text>

            <Text style={styles.syncStatus}>
              {syncLabel}
            </Text>

            <Text style={styles.infoSubtitle}>
              {syncHint}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Preferences */}
        <Text style={styles.sectionTitle}>
          Preferences
        </Text>

        <TouchableOpacity style={styles.infoCard} disabled={!authed} onPress={toggleLanguage}>
          <View style={styles.infoIcon}>
            <Text>🌐</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Language
            </Text>

            <Text style={styles.infoSubtitle}>
              {user?.preferredLanguage === 'hi' ? 'हिन्दी (Hindi)' : 'English'}
              {authed ? ' • Tap to switch' : ''}
            </Text>
          </View>

          {authed && (
            <Text style={styles.arrow}>
              ›
            </Text>
          )}
        </TouchableOpacity>

        {/* Account */}
        <Text style={styles.sectionTitle}>
          Account
        </Text>

        {authed ? (
          <>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={confirmLogout}
              disabled={busy}
            >
              <Text style={styles.logoutText}>
                {busy ? 'Logging out…' : 'Log Out'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
              <Text style={styles.deleteText}>Delete account</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginText}>
              Log in or create an account
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.version}>
          GyanSetu • Version 1.0.0
        </Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  deleteButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },

  deleteText: {
    fontSize: 12,
    color: '#A04545',
    textDecorationLine: 'underline',
  },

  loginButton: {
    height: 50,
    borderRadius: 15,
    backgroundColor: '#315C43',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  loginText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFDF8',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F2F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backText: {
    fontSize: 32,
    lineHeight: 34,
    color: '#315C43',
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#20352A',
  },

  profileCard: {
    backgroundColor: '#F3F7EF',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#DCE9D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 29,
  },

  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },

  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 4,
  },

  email: {
    fontSize: 13,
    color: '#718078',
  },

  editButton: {
    backgroundColor: '#315C43',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 12,
  },

  editText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 12,
    marginTop: 4,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 26,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDE4',
  },

  statNumber: {
    fontSize: 21,
    fontWeight: '700',
    color: '#315C43',
    marginBottom: 5,
  },

  statLabel: {
    fontSize: 11,
    color: '#7B857E',
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDE4',
    marginBottom: 11,
  },

  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F0F5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  infoContent: {
    flex: 1,
    marginLeft: 13,
  },

  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#283B30',
    marginBottom: 4,
  },

  infoSubtitle: {
    fontSize: 11,
    lineHeight: 17,
    color: '#7A847D',
  },

  arrow: {
    fontSize: 25,
    color: '#9AA39C',
    marginLeft: 8,
  },

  syncCard: {
    backgroundColor: '#F3F7EF',
    borderRadius: 17,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
  },

  syncIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#DCE9D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  syncStatus: {
    fontSize: 11,
    color: '#4D805D',
    marginBottom: 4,
  },

  logoutButton: {
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D7B9B9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A05252',
  },

  version: {
    textAlign: 'center',
    fontSize: 11,
    color: '#A0A7A1',
    marginTop: 22,
  },
});