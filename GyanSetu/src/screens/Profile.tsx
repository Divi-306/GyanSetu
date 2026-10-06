import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { db } from '@/db';
import { useLocalData } from '@/hooks/useLocalData';
import { LANGUAGE_LABELS, persistPreferredLanguage, useTranslation } from '@/i18n';
import { errorMessage, NetworkError } from '@/lib/api';
import { formatBytes, timeAgo } from '@/lib/format';
import { goBackOr } from '@/lib/nav';
import { deleteAccount, logout, pendingChanges, updateUser } from '@/services/account';
import { getLearningStats } from '@/services/learning';
import { syncNow } from '@/services/sync';
import { selectOnline, useApp, type SupportedLanguage } from '@/stores/appStore';

async function loadProfileData() {
  const stats = await getLearningStats();
  const packs = await db.getFirstAsync<{ n: number; bytes: number | null }>(
    "SELECT count(*) AS n, sum(size_bytes) AS bytes FROM learning_packs WHERE pack_key <> 'starter' AND state = 'ACTIVE'",
  );
  return { stats, packCount: packs?.n ?? 0, packBytes: packs?.bytes ?? 0, freeBytes: Paths.availableDiskSpace };
}

export default function Profile() {
  const user = useApp((s) => s.user);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const online = useApp(selectOnline);
  const { language, t } = useTranslation();
  const { syncing, pendingSyncCount, lastSyncAt } = useApp();
  const { data } = useLocalData(loadProfileData);
  const [busy, setBusy] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  const stats = data?.stats;

  const syncLabel = syncing
    ? t('profile.syncing')
    : pendingSyncCount > 0
      ? t('profile.changesPending', {
          count: pendingSyncCount,
          plural: pendingSyncCount === 1 ? '' : 's',
        })
      : authed
        ? t('profile.allChangesSynced')
        : t('profile.allChangesSaved');

  const syncHint = !authed
    ? t('profile.logInToBackUp')
    : lastSyncAt
      ? t('profile.lastSynced', {
          time: timeAgo(lastSyncAt),
          suffix: online ? '' : ` ${t('profile.syncReminder')}`,
        })
      : t('profile.syncReminder');

  const changeLanguage = async (nextLanguage: SupportedLanguage) => {
    try {
      await persistPreferredLanguage(nextLanguage);
      if (authed) await updateUser({ preferredLanguage: nextLanguage });
    } catch (err) {
      if (!(err instanceof NetworkError)) {
        Alert.alert(t('errors.couldNotChangeLanguage'), errorMessage(err));
      }
    }
  };

  const openLanguagePicker = () => setLanguagePickerOpen(true);

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
      t('profile.unsyncedProgress'),
      t('profile.logoutPrompt', {
        count: pending,
        plural: pending === 1 ? '' : 's',
      }),
      [
        { text: t('profile.stayLoggedIn'), style: 'cancel' },
        { text: t('profile.logoutAnyway'), style: 'destructive', onPress: () => void doLogout() },
      ],
    );
  };

  const confirmDelete = () =>
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountPrompt'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/');
            } catch (err) {
              Alert.alert(t('errors.unableToDeleteAccount'), errorMessage(err));
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
            {t('profile.title')}
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
              {user?.name || t('profile.student')}
            </Text>

            <Text style={styles.email}>
              {user ? user.email ?? user.phone : t('profile.offlineLearner')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(authed ? '/profile/edit' : '/login')}
          >
            <Text style={styles.editText}>
              {authed ? t('profile.edit') : t('profile.login')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Learning Overview */}
        <Text style={styles.sectionTitle}>
          {t('profile.learningOverview')}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.coursesStarted ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              {t('profile.courses')}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.lessonsCompleted ?? 0}
            </Text>

            <Text style={styles.statLabel}>
              {t('profile.lessonsDone')}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats?.averagePercent ?? 0}%
            </Text>

            <Text style={styles.statLabel}>
              {t('profile.progress')}
            </Text>
          </View>
        </View>

        {/* Offline Learning */}
        <Text style={styles.sectionTitle}>
          {t('profile.offlineLearning')}
        </Text>

        <TouchableOpacity style={styles.infoCard} onPress={() => router.push('/courses')}>
          <View style={styles.infoIcon}>
            <Text>📥</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              {t('profile.downloadedLearningPacks')}
            </Text>

            <Text style={styles.infoSubtitle}>
              {data?.packCount
                ? `${data.packCount} ${t('profile.courses')} • ${formatBytes(data.packBytes)}`
                : t('profile.starterBundleOnly')}
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text>💾</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              {t('profile.deviceStorage')}
            </Text>

            <Text style={styles.infoSubtitle}>
              {t('profile.storageSummary', {
                used: formatBytes(data?.packBytes ?? 0),
                free: formatBytes(data?.freeBytes),
              })}
            </Text>
          </View>
        </View>

        {/* Sync */}
        <Text style={styles.sectionTitle}>
          {t('profile.syncAndConnectivity')}
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
              {authed && online && !syncing ? t('profile.tapToSync') : t('profile.syncStatus')}
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
          {t('profile.preferences')}
        </Text>

        <TouchableOpacity style={styles.infoCard} onPress={openLanguagePicker}>
          <View style={styles.infoIcon}>
            <Text>🌐</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              {t('common.language')}
            </Text>

            <Text style={styles.infoSubtitle}>
              {LANGUAGE_LABELS[language]}
              {authed ? ` • ${t('profile.tapToSwitch')}` : ''}
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        {/* Account */}
        <Text style={styles.sectionTitle}>
          {t('profile.account')}
        </Text>

        {authed ? (
          <>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={confirmLogout}
              disabled={busy}
            >
              <Text style={styles.logoutText}>
                {busy ? t('profile.loggingOut') : t('common.logout')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
              <Text style={styles.deleteText}>{t('profile.deleteAccount')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginText}>
              {t('profile.login')} / {t('common.createAccount')}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.version}>
          GyanSetu • Version 1.0.0
        </Text>

      </ScrollView>

      <Modal
        visible={languagePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLanguagePickerOpen(false)}
      >
        <View style={styles.languageModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.languageBackdrop}
            onPress={() => setLanguagePickerOpen(false)}
          />
          <View style={styles.languageSheet}>
            <View style={styles.languageSheetHeader}>
              <View style={styles.languageSheetHeading}>
                <Text style={styles.languageSheetTitle}>{t('profile.appLanguage')}</Text>
                <Text style={styles.languageSheetDescription}>{t('profile.languageDescription')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLanguagePickerOpen(false)}
                hitSlop={10}
              >
                <Text style={styles.languageClose}>{t('common.close')}</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(LANGUAGE_LABELS).map(([code, label]) => {
                const selected = code === language;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={[styles.languageOption, selected && styles.languageOptionSelected]}
                    onPress={() => {
                      setLanguagePickerOpen(false);
                      void changeLanguage(code as SupportedLanguage);
                    }}
                  >
                    <Text style={[styles.languageOptionText, selected && styles.languageOptionTextSelected]}>
                      {label}
                    </Text>
                    <Text style={styles.languageOptionCode}>{code.toUpperCase()}</Text>
                    {selected && <Text style={styles.languageCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  languageModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  languageBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 33, 26, 0.48)',
  },

  languageSheet: {
    maxHeight: '82%',
    backgroundColor: '#FFFDF8',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
  },

  languageSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  languageSheetHeading: {
    flex: 1,
    paddingRight: 16,
  },

  languageSheetTitle: {
    color: '#20352A',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 5,
  },

  languageSheetDescription: {
    color: '#718078',
    fontSize: 13,
    lineHeight: 19,
  },

  languageClose: {
    color: '#315C43',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 4,
  },

  languageOption: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EDE4',
    paddingHorizontal: 12,
  },

  languageOptionSelected: {
    backgroundColor: '#F0F5EC',
  },

  languageOptionText: {
    flex: 1,
    color: '#283B30',
    fontSize: 16,
  },

  languageOptionTextSelected: {
    color: '#315C43',
    fontWeight: '700',
  },

  languageOptionCode: {
    color: '#7A847D',
    fontSize: 11,
    marginRight: 12,
  },

  languageCheck: {
    color: '#315C43',
    fontSize: 17,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
});