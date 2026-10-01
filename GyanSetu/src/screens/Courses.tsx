import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useLocalData } from '@/hooks/useLocalData';
import { NetworkError } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { goBackOr } from '@/lib/nav';
import { listCatalog, listOfflineCourseIds, listStarterCourses, type CourseSummary } from '@/services/learning';
import { refreshCatalog, useDownloads } from '@/services/packs';
import { selectOnline, useApp } from '@/stores/appStore';

const TABS = ['All', 'Downloaded', 'Available Offline'] as const;
type Tab = (typeof TABS)[number];

async function loadCourses() {
  const [catalog, offline, starter] = await Promise.all([listCatalog(), listOfflineCourseIds(), listStarterCourses()]);
  return { catalog, offline, starter };
}

function statusBadge(course: CourseSummary, downloading: { receivedBytes: number; totalBytes: number } | undefined) {
  if (downloading) {
    return `${Math.floor((100 * downloading.receivedBytes) / Math.max(1, downloading.totalBytes))}%`;
  }
  if (course.pack?.state === 'ACTIVE') {
    return course.serverPackVersion && course.serverPackVersion > course.pack.version ? '↻' : '✓';
  }
  return '↓';
}

export default function Courses() {
  const [activeTab, setActiveTab] = useState<Tab>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const online = useApp(selectOnline);
  const downloads = useDownloads((s) => s.active);
  const { data } = useLocalData(loadCourses);

  const courses = useMemo(() => {
    const all = data?.catalog ?? [];
    if (activeTab === 'Downloaded') return all.filter((c) => c.pack?.state === 'ACTIVE');
    if (activeTab === 'Available Offline') return all.filter((c) => data?.offline.has(c.id));
    return all;
  }, [data, activeTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshCatalog();
    } catch (err) {
      setRefreshError(err instanceof NetworkError ? "You're offline. Showing saved courses." : 'Could not refresh courses.');
    } finally {
      setRefreshing(false);
    }
  };

  const catalogEmpty = data !== undefined && data.catalog.length === 0;

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>

        <Pressable
          style={styles.backButton}
          onPress={() => goBackOr('/dashboard')}
        >
          <Text style={styles.backArrow}>
            ‹
          </Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          Courses
        </Text>

        <Text style={styles.searchIcon}>
          {online ? '●' : '○'}
        </Text>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* Tabs */}
        <View style={styles.tabs}>

          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                activeTab === tab &&
                  styles.activeTab,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab &&
                    styles.activeTabText,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}

        </View>

        {/* Starter Bundle */}
        <Pressable
          style={styles.bundleCard}
          onPress={() => router.push('/starter-bundle')}
        >

          <View style={styles.bundleIcon}>
            <Text style={styles.bundleEmoji}>
              🎁
            </Text>
          </View>

          <View style={styles.bundleContent}>

            <Text style={styles.bundleTitle}>
              Starter Bundle
            </Text>

            <Text style={styles.bundleSubtitle}>
              Explore courses without an account
            </Text>

            <Text style={styles.bundleMeta}>
              {data?.starter.length ?? 0} sample courses • Demo lessons • Demo quizzes • Offline
            </Text>

          </View>

          <Text style={styles.arrow}>
            →
          </Text>

        </Pressable>

        {/* Course heading */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'All' ? 'All Courses' : activeTab}
          </Text>

          <Text style={styles.count}>
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </Text>
        </View>

        {refreshError && (
          <Text style={styles.notice}>
            {refreshError}
          </Text>
        )}

        {catalogEmpty && (
          <Text style={styles.notice}>
            Connect to the internet once to see all courses. The Starter Bundle above works offline.
          </Text>
        )}

        {!catalogEmpty && courses.length === 0 && (
          <Text style={styles.notice}>
            {activeTab === 'Downloaded'
              ? 'No downloaded courses yet. Open a course and tap Download to learn offline.'
              : 'Nothing here yet.'}
          </Text>
        )}

        {/* Course list */}
        {courses.map((course) => {
          const size = course.pack?.state === 'ACTIVE' ? course.pack.sizeBytes : course.fullSizeBytes;
          return (
            <Pressable
              key={course.id}
              style={styles.courseCard}
              onPress={() => router.push(`/course/${course.id}`)}
            >

              <View style={styles.courseIcon}>
                <Text style={styles.courseEmoji}>
                  {course.icon ?? '📘'}
                </Text>
              </View>

              <View style={styles.courseContent}>

                <Text style={styles.courseName}>
                  {course.title}
                </Text>

                <Text style={styles.courseSubtitle}>
                  {course.subtitle}
                </Text>

                <Text style={styles.courseMeta}>
                  {course.lessonCount} lessons • {formatBytes(size)}
                  {course.percent > 0 ? ` • ${course.percent}% done` : ''}
                </Text>

              </View>

              <View style={styles.download}>
                <Text style={styles.downloadText}>
                  {statusBadge(course, downloads[course.id])}
                </Text>
              </View>

            </Pressable>
          );
        })}

        <View style={styles.bottomSpace} />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    fontSize: 12,
    lineHeight: 18,
    color: '#5D7864',
    marginBottom: 12,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  header: {
    height: 78,
    paddingTop: 25,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E8E3',
  },

  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
  },

  backArrow: {
    fontSize: 32,
    color: '#26382C',
  },

  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1E3227',
  },

  searchIcon: {
    fontSize: 25,
    color: '#34473C',
  },

  content: {
    padding: 17,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#EDEFEA',
    padding: 3,
    borderRadius: 12,
    marginBottom: 14,
  },

  tab: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },

  activeTab: {
    backgroundColor: '#239653',
  },

  tabText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#68736C',
    textAlign: 'center',
  },

  activeTabText: {
    color: '#FFFFFF',
  },

  bundleCard: {
    minHeight: 92,
    borderRadius: 17,
    backgroundColor: '#E8F4E8',
    borderWidth: 1,
    borderColor: '#CFE3CE',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },

  bundleIcon: {
    width: 55,
    height: 55,
    borderRadius: 16,
    backgroundColor: '#D7EBD5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bundleEmoji: {
    fontSize: 27,
  },

  bundleContent: {
    flex: 1,
    marginLeft: 12,
  },

  bundleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#244B32',
  },

  bundleSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#607066',
  },

  bundleMeta: {
    marginTop: 5,
    fontSize: 8,
    color: '#708077',
  },

  arrow: {
    fontSize: 22,
    color: '#4C7958',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 19,
    marginBottom: 9,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#26382C',
  },

  count: {
    fontSize: 10,
    color: '#5D7864',
  },

  courseCard: {
    minHeight: 82,
    marginBottom: 10,
    padding: 11,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E6E1',
    flexDirection: 'row',
    alignItems: 'center',
  },

  courseIcon: {
    width: 53,
    height: 53,
    borderRadius: 15,
    backgroundColor: '#EAF4E9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  courseEmoji: {
    fontSize: 27,
  },

  courseContent: {
    flex: 1,
    marginLeft: 12,
  },

  courseName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#26382C',
  },

  courseSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#777F7A',
  },

  courseMeta: {
    marginTop: 5,
    fontSize: 9,
    color: '#7C857F',
  },

  download: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E6F4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  downloadText: {
    fontSize: 21,
    color: '#31925A',
  },

  bottomSpace: {
    height: 30,
  },
});