import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { useLocalData } from '@/hooks/useLocalData';
import { getContinueLearning } from '@/services/learning';
import { selectOnline, useApp } from '@/stores/appStore';

export default function Dashboard() {
  const { t } = useTranslation();
  const user = useApp((s) => s.user);
  const isGuest = useApp((s) => s.sessionStatus !== 'authed');
  const online = useApp(selectOnline);
  const pending = useApp((s) => s.pendingSyncCount);
  const syncing = useApp((s) => s.syncing);
  const { data: resume } = useLocalData(getContinueLearning);

  const greetingName = user?.name?.trim() ? user.name.split(' ')[0] : null;

  const onMyCourses = () => router.push('/courses');
  const onTakeQuiz = () => router.push('/quizzes');
  const onAskAI = () => router.push('/ai');
  const onScholarships = () => router.push('/scholarships');
  const onProfile = () => router.push('/profile');
  const onContinueLearning = () => {
    if (!resume) router.push('/starter-bundle');
    else if (resume.lastLessonId) router.push(`/lesson/${resume.lastLessonId}`);
    else router.push(`/course/${resume.courseId}`);
  };

  const statusTitle = online ? t('common.online') : t('dashboard.offlineMode');
  const statusText = syncing
    ? t('dashboard.savingProgress')
    : pending > 0
      ? isGuest
        ? t('dashboard.guestChangesSaved', { count: pending })
        : t('dashboard.changesWaitingToSync', { count: pending })
      : online
        ? isGuest
          ? t('dashboard.logInToBackUp')
          : t('dashboard.progressBackedUp')
        : t('dashboard.learningWithoutInternet');
  const percent = resume?.percent ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {greetingName
                ? t('dashboard.greetingWithName', { name: greetingName })
                : t('dashboard.greeting')}
            </Text>

            <Text style={styles.subtitle}>
              {t('auth.continueJourney')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            onPress={onProfile}
          >
            <Text style={styles.profileIcon}>
              👤
            </Text>
          </TouchableOpacity>
        </View>

        {/* Offline Status */}
        <TouchableOpacity style={styles.offlineBanner} onPress={() => router.push('/offline')} activeOpacity={0.85}>
          <View style={[styles.statusDot, !online && styles.statusDotOffline]} />

          <View style={styles.offlineContent}>
            <Text style={styles.offlineTitle}>
              {statusTitle}
            </Text>

            <Text style={styles.offlineText}>
              {statusText}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Continue Learning */}
        <Text style={styles.sectionTitle}>
          {t('navigation.continueLearning')}
        </Text>

        <TouchableOpacity
          style={styles.continueCard}
          onPress={onContinueLearning}
          activeOpacity={0.85}
        >
          <View style={styles.courseIcon}>
            <Text style={styles.courseIconText}>
              {resume?.icon ?? '📚'}
            </Text>
          </View>

          <View style={styles.courseInfo}>
            <Text style={styles.courseName}>
              {resume ? resume.title : t('dashboard.startStarterBundle')}
            </Text>

            <Text style={styles.lessonText}>
              {resume
                ? resume.lastLessonTitle
                  ? t('dashboard.continueLesson', { title: resume.lastLessonTitle })
                  : t('dashboard.continueWhereLeftOff')
                : t('dashboard.sampleLessonsOffline')}
            </Text>

            <View style={styles.progressBackground}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${percent}%` },
                ]}
              />
            </View>

            <Text style={styles.progressText}>
              {t('dashboard.percentCompleted', { percent })}
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        {/* My Courses */}
        <Text style={styles.sectionTitle}>
          {t('navigation.myLearning')}
        </Text>

        <TouchableOpacity
          style={styles.myCoursesCard}
          onPress={onMyCourses}
          activeOpacity={0.85}
        >
          <View style={styles.myCoursesIcon}>
            <Text style={styles.myCoursesIconText}>
              📖
            </Text>
          </View>

          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>
              {t('navigation.courses')}
            </Text>

            <Text style={styles.cardSubtitle}>
              {t('dashboard.browseCourses')}
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>
          {t('navigation.quickActions')}
        </Text>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={onTakeQuiz}
            activeOpacity={0.85}
          >
            <View style={styles.actionIcon}>
              <Text>📝</Text>
            </View>

            <Text style={styles.actionTitle}>
              {t('navigation.takeQuiz')}
            </Text>

            <Text style={styles.actionSubtitle}>
              {t('navigation.practiceOffline')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={onAskAI}
            activeOpacity={0.85}
          >
            <View style={styles.actionIcon}>
              <Text>🤖</Text>
            </View>

            <Text style={styles.actionTitle}>
              {t('navigation.ai')}
            </Text>

            <Text style={styles.actionSubtitle}>
              {t('navigation.clearDoubts')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Scholarships */}
        <TouchableOpacity
          style={styles.scholarshipCard}
          onPress={onScholarships}
          activeOpacity={0.85}
        >
          <View style={styles.scholarshipIcon}>
            <Text>🎓</Text>
          </View>

          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>
              {t('navigation.scholarships')}
            </Text>

            <Text style={styles.cardSubtitle}>
              {t('dashboard.scholarshipDescription')}
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        {/* Offline Learning */}
        <View style={styles.bottomCard}>
          <Text style={styles.bottomIcon}>
            🌱
          </Text>

          <View style={styles.bottomText}>
            <Text style={styles.bottomTitle}>
              {t('dashboard.learningContinues')}
            </Text>

            <Text style={styles.bottomSubtitle}>
              {t('dashboard.progressSavedLocally')}
            </Text>
          </View>
        </View>

        {isGuest && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.backButtonText}>
              {t('dashboard.logInOrCreateAccount')}
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusDotOffline: {
    backgroundColor: '#D79A35',
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
    marginBottom: 22,
  },

  greeting: {
    fontSize: 25,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 5,
  },

  subtitle: {
    fontSize: 13,
    color: '#7A847D',
  },

  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E8F0E4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileIcon: {
    fontSize: 21,
  },

  offlineBanner: {
    backgroundColor: '#F1F6ED',
    borderRadius: 17,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 27,
    borderWidth: 1,
    borderColor: '#E1EADB',
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5D9568',
    marginRight: 12,
  },

  offlineContent: {
    flex: 1,
  },

  offlineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#315C43',
    marginBottom: 3,
  },

  offlineText: {
    fontSize: 11,
    color: '#728078',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 12,
    marginTop: 3,
  },

  continueCard: {
    backgroundColor: '#F3F7EF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 27,
  },

  courseIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#DCE9D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  courseIconText: {
    fontSize: 23,
  },

  courseInfo: {
    flex: 1,
    marginLeft: 13,
  },

  courseName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#263A2E',
    marginBottom: 4,
  },

  lessonText: {
    fontSize: 11,
    color: '#7A847D',
    marginBottom: 9,
  },

  progressBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D9E2D5',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#5C8865',
  },

  progressText: {
    fontSize: 10,
    color: '#6E7A71',
    marginTop: 5,
  },

  arrow: {
    fontSize: 26,
    color: '#9AA39C',
    marginLeft: 8,
  },

  myCoursesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7ECE3',
    marginBottom: 27,
  },

  myCoursesIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#EEF4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  myCoursesIconText: {
    fontSize: 22,
  },

  cardText: {
    flex: 1,
    marginLeft: 13,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#293B30',
    marginBottom: 4,
  },

  cardSubtitle: {
    fontSize: 11,
    lineHeight: 17,
    color: '#7A847D',
  },

  quickActions: {
    flexDirection: 'row',
    gap: 11,
    marginBottom: 12,
  },

  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E7ECE3',
  },

  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EEF4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },

  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#293B30',
    marginBottom: 4,
  },

  actionSubtitle: {
    fontSize: 10,
    color: '#7A847D',
  },

  scholarshipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7ECE3',
    marginBottom: 24,
  },

  scholarshipIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#F2F0E5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomCard: {
    backgroundColor: '#F5F7F2',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  bottomIcon: {
    fontSize: 24,
  },

  bottomText: {
    flex: 1,
    marginLeft: 12,
  },

  bottomTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#315C43',
    marginBottom: 4,
  },

  bottomSubtitle: {
    fontSize: 10,
    lineHeight: 16,
    color: '#7A847D',
  },

  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },

  backButtonText: {
    fontSize: 12,
    color: '#718078',
  },
});