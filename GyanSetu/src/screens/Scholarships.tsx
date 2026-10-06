import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { useTranslation } from '@/i18n';
import { formatDate, timeAgo } from '@/lib/format';
import { goBackOr } from '@/lib/nav';
import { loadScholarships, type Scholarship, type ScholarshipList } from '@/services/account';
import { useApp } from '@/stores/appStore';

const TABS = ['All', 'Likely match', 'Check details'] as const;
type Tab = (typeof TABS)[number];

const STATUS = {
  likely_eligible: { label: 'scholarship.likelyMatch', icon: '🎯' },
  check_details: { label: 'scholarship.checkDetails', icon: '📝' },
  not_eligible: { label: 'scholarship.notMatch', icon: '📄' },
} as const;

function ScholarshipCard({ scholarship }: { scholarship: Scholarship }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const status = STATUS[scholarship.match.status];

  return (
    <Pressable style={styles.card} onPress={() => setExpanded(!expanded)}>
      <View style={styles.cardTop}>

        <View style={styles.iconBox}>
          <Text style={styles.cardIcon}>
            {status.icon}
          </Text>
        </View>

        <View style={styles.cardTitleArea}>
          <Text
            style={styles.cardTitle}
            numberOfLines={expanded ? undefined : 2}
          >
            {scholarship.name}
          </Text>

          <Text style={styles.cardDescription} numberOfLines={expanded ? undefined : 2}>
            {scholarship.amount ?? scholarship.description}
          </Text>
        </View>

      </View>

      {/* Match + Provider */}
      <View style={styles.metaRow}>
        <View
          style={[
            styles.categoryBadge,
            scholarship.match.status === 'likely_eligible' && styles.badgeLikely,
            scholarship.match.status === 'not_eligible' && styles.badgeNot,
          ]}
        >
          <Text style={styles.categoryText}>
            {t(status.label)}
          </Text>
        </View>

        <Text
          style={styles.provider}
          numberOfLines={1}
        >
          {scholarship.provider}
        </Text>
      </View>

      {expanded && (
        <View style={styles.reasons}>
          {scholarship.description && <Text style={styles.reasonIntro}>{scholarship.description}</Text>}
          {scholarship.match.reasons.map((r) => (
            <Text key={r.label} style={styles.reason}>
              {r.met === true ? '✓' : r.met === false ? '✗' : '?'}  {r.label}
            </Text>
          ))}
          <Text style={styles.verified}>
            {t('scholarship.verified', { date: formatDate(scholarship.lastVerifiedAt) })}
          </Text>
        </View>
      )}

      {/* Bottom */}
      <View style={styles.cardBottom}>

        <View>
          <Text style={styles.deadlineLabel}>
            {t('scholarship.deadline')}
          </Text>

          <Text style={styles.deadline}>
            {scholarship.deadline ? formatDate(scholarship.deadline) : t('scholarship.open')}
          </Text>
        </View>

        <Pressable
          onPress={() => void Linking.openURL(scholarship.applyUrl)}
          style={({ pressed }) => [
            styles.applyButton,
            pressed && styles.applyButtonPressed,
          ]}
        >
          <Text style={styles.applyText}>
            {t('scholarship.apply')}
          </Text>
        </Pressable>

      </View>
    </Pressable>
  );
}

export default function Scholarships() {
  const { t } = useTranslation();
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const [activeTab, setActiveTab] = useState<Tab>('All');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<(ScholarshipList & { stale: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!authed) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      loadScholarships()
        .then((l) => !cancelled && (setList(l), setError(null)))
        .catch((err) => !cancelled && setError(errorMessage(err)))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [authed]),
  );

  const filteredScholarships = useMemo(() => {
    const searchText = search.toLowerCase();
    return (list?.scholarships ?? []).filter((item) => {
      const matchesTab =
        activeTab === 'All' ||
        (activeTab === 'Likely match' && item.match.status === 'likely_eligible') ||
        (activeTab === 'Check details' && item.match.status === 'check_details');

      const matchesSearch =
        item.name.toLowerCase().includes(searchText) ||
        (item.description ?? '').toLowerCase().includes(searchText) ||
        item.provider.toLowerCase().includes(searchText);

      return matchesTab && matchesSearch;
    });
  }, [list, activeTab, search]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => goBackOr('/dashboard')}
            style={styles.backButton}
            hitSlop={10}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <Text style={styles.headerTitle}>
            {t('navigation.scholarships')}
          </Text>

          <Pressable style={styles.notificationButton} onPress={() => router.push('/profile/edit')}>
            <Text style={styles.notificationIcon}>👤</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          {/* Intro */}
          <View style={styles.intro}>
            <Text style={styles.title}>
              {t('scholarship.find')}
            </Text>

            <Text style={styles.subtitle}>
              {t('scholarship.subtitle')}
            </Text>
          </View>

          {!authed && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                {t('scholarship.loginPrompt')}
              </Text>
              <Pressable style={styles.noticeButton} onPress={() => router.push('/login')}>
                <Text style={styles.noticeButtonText}>{t('common.login')}</Text>
              </Pressable>
            </View>
          )}

          {authed && list && !list.profileComplete && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                {t('scholarship.completeProfilePrompt')}
              </Text>
              <Pressable style={styles.noticeButton} onPress={() => router.push('/profile/edit')}>
                <Text style={styles.noticeButtonText}>{t('scholarship.completeProfile')}</Text>
              </Pressable>
            </View>
          )}

          {list?.stale && (
            <Text style={styles.staleText}>
              {t('scholarship.offlineResults', { time: timeAgo(list.fetchedAt) })}
            </Text>
          )}

          {error && <Text style={styles.staleText}>{error}</Text>}

          {authed && (
            <>
              {/* Search */}
              <View style={styles.searchContainer}>
                <Text style={styles.searchIcon}>⌕</Text>

                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('scholarship.searchPlaceholder')}
                  placeholderTextColor="#8B928B"
                  style={styles.searchInput}
                  returnKeyType="search"
                />

                {search.length > 0 && (
                  <Pressable
                    onPress={() => setSearch('')}
                    style={styles.clearButton}
                  >
                    <Text style={styles.clearText}>×</Text>
                  </Pressable>
                )}
              </View>

              {/* Tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabsContainer}
              >
                {TABS.map(
                  (tab) => {
                    const isActive = activeTab === tab;

                    return (
                      <Pressable
                        key={tab}
                        onPress={() => setActiveTab(tab)}
                        style={[
                          styles.tab,
                          isActive && styles.activeTab,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            isActive && styles.activeTabText,
                          ]}
                        >
                          {tab === 'All' ? t('scholarship.all') : t(`scholarship.${tab === 'Likely match' ? 'likelyMatch' : 'checkDetails'}`)}
                        </Text>
                      </Pressable>
                    );
                  }
                )}
              </ScrollView>

              {/* Results count */}
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>
                  {t('scholarship.forYou')}
                </Text>

                <Text style={styles.resultCount}>
                  {filteredScholarships.length}
                </Text>
              </View>

              {loading && !list && <ActivityIndicator color="#315C43" style={styles.loading} />}

              {/* Scholarship Cards */}
              {filteredScholarships.map((scholarship) => (
                <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
              ))}

              {/* Empty State */}
              {!loading && list && filteredScholarships.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🔎</Text>

                  <Text style={styles.emptyTitle}>
                    {t('scholarship.notFound')}
                  </Text>

                  <Text style={styles.emptyText}>
                    {t('scholarship.tryDifferent')}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>ⓘ</Text>

            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>
                {t('scholarship.information')}
              </Text>

              <Text style={styles.infoText}>
                {list?.disclaimer ??
                  t('scholarship.defaultDisclaimer')}
              </Text>
            </View>
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  badgeLikely: {
    backgroundColor: '#DCEFDF',
  },

  badgeNot: {
    backgroundColor: '#F1EFEA',
  },

  reasons: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF0EC',
  },

  reasonIntro: {
    fontSize: 12,
    lineHeight: 18,
    color: '#56615A',
    marginBottom: 8,
  },

  reason: {
    fontSize: 12,
    lineHeight: 19,
    color: '#34443B',
  },

  verified: {
    fontSize: 11,
    color: '#8B928B',
    marginTop: 8,
  },

  notice: {
    backgroundColor: '#FFF6E6',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },

  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5B4A26',
  },

  noticeButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#315C43',
  },

  noticeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  staleText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A6A2A',
    marginBottom: 12,
  },

  loading: {
    marginVertical: 24,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  header: {
    height: 64,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7E2',
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 36,
    lineHeight: 40,
    color: '#26352A',
    fontWeight: '300',
  },

  headerTitle: {
    flex: 1,
    marginLeft: 4,
    fontSize: 21,
    fontWeight: '700',
    color: '#26352A',
  },

  notificationButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationIcon: {
    fontSize: 20,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },

  intro: {
    marginBottom: 18,
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#26352A',
    marginBottom: 5,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#70786F',
  },

  searchContainer: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5DF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  searchIcon: {
    fontSize: 25,
    color: '#6F796F',
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: '#26352A',
    paddingVertical: 0,
  },

  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1EC',
  },

  clearText: {
    fontSize: 20,
    lineHeight: 22,
    color: '#687168',
  },

  tabsContainer: {
    gap: 9,
    paddingBottom: 21,
  },

  tab: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E5DE',
  },

  activeTab: {
    backgroundColor: '#2F6B3D',
    borderColor: '#2F6B3D',
  },

  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#626B63',
  },

  activeTabText: {
    color: '#FFFFFF',
  },

  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  resultTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#26352A',
  },

  resultCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#E3EEE4',
    color: '#2F6B3D',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#E5E8E3',
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF4ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  cardIcon: {
    fontSize: 23,
  },

  cardTitleArea: {
    flex: 1,
    paddingTop: 1,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#26352A',
    lineHeight: 21,
  },

  cardDescription: {
    fontSize: 13,
    color: '#777F78',
    marginTop: 4,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },

  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F0F4EE',
  },

  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3C6846',
  },

  provider: {
    flex: 1,
    marginLeft: 9,
    fontSize: 12,
    color: '#858C85',
  },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#EEF0ED',
  },

  deadlineLabel: {
    fontSize: 11,
    color: '#8A918B',
    marginBottom: 2,
  },

  deadline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37443A',
  },

  applyButton: {
    minWidth: 78,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: '#2F6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  applyButtonPressed: {
    opacity: 0.75,
  },

  applyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },

  emptyIcon: {
    fontSize: 35,
    marginBottom: 10,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#344038',
  },

  emptyText: {
    fontSize: 13,
    color: '#818881',
    marginTop: 5,
  },

  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#EEF4EE',
    borderRadius: 15,
    padding: 14,
    marginTop: 5,
  },

  infoIcon: {
    fontSize: 18,
    color: '#3C6846',
    marginRight: 10,
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#35523B',
    marginBottom: 4,
  },

  infoText: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#637065',
  },
});