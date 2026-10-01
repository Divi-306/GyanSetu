import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useLocalData } from '@/hooks/useLocalData';
import { goBackOr } from '@/lib/nav';
import { getContinueLearning } from '@/services/learning';
import { selectOnline, useApp } from '@/stores/appStore';

export default function Offline() {
  const online = useApp(selectOnline);
  const { data: resume } = useLocalData(getContinueLearning);
  const onBack = () => goBackOr('/dashboard');
  const percent = resume?.percent ?? 0;
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <View>
          <Text style={styles.headerTitle}>
            Offline Learning
          </Text>

          <Text style={styles.headerSubtitle}>
            Your learning continues
          </Text>
        </View>

        <View style={styles.offlineBadge}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>
            {online ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* Welcome Card */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeIcon}>
            <Text style={styles.welcomeIconText}>
              ↓
            </Text>
          </View>

          <View style={styles.welcomeContent}>
            <Text style={styles.welcomeTitle}>
              Starter Learning Pack
            </Text>

            <Text style={styles.welcomeDescription}>
              Your downloaded learning material is
              available even without internet.
            </Text>
          </View>
        </View>

        {/* Pack Information */}
        <View style={styles.packCard}>

          <View style={styles.packHeader}>
            <View>
              <Text style={styles.packTitle}>
                {resume?.title ?? 'Starter Bundle'}
              </Text>

              <Text style={styles.packSubtitle}>
                {resume ? 'Your current course' : 'Sample lessons from 5 subjects'}
              </Text>
            </View>

            <View style={styles.activeBadge}>
              <Text style={styles.activeText}>
                Available Offline
              </Text>
            </View>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressInfo}>
              <Text style={styles.progressLabel}>
                Learning progress
              </Text>

              <Text style={styles.progressValue}>
                {percent}%
              </Text>
            </View>

            <View style={styles.progressBackground}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
          </View>

          <Text style={styles.packInfo}>
            Lessons • Quizzes • Offline AI
          </Text>
        </View>

        {/* Continue Learning */}
        <Text style={styles.sectionTitle}>
          Continue Learning
        </Text>

        <Pressable
          style={styles.lessonCard}
          onPress={() =>
            resume?.lastLessonId
              ? router.push(`/lesson/${resume.lastLessonId}`)
              : router.push(resume ? `/course/${resume.courseId}` : '/starter-bundle')
          }
        >

          <View style={styles.numberCircle}>
            <Text style={styles.numberText}>
              {resume?.icon ?? '1'}
            </Text>
          </View>

          <View style={styles.lessonContent}>
            <Text style={styles.lessonTitle}>
              {resume?.lastLessonTitle ?? (resume ? resume.title : 'Open the Starter Bundle')}
            </Text>

            <Text style={styles.lessonSubtitle}>
              Available offline
            </Text>
          </View>

          <Text style={styles.playButton}>
            ▶
          </Text>

        </Pressable>

        {/* Available Offline */}
        <Text style={styles.sectionTitle}>
          Available Offline
        </Text>

        <View style={styles.featureGrid}>

          <Pressable style={styles.featureCard} onPress={() => router.push('/courses')}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>
                📖
              </Text>
            </View>

            <Text style={styles.featureTitle}>
              Lessons
            </Text>

            <Text style={styles.featureSubtitle}>
              Read downloaded lessons
            </Text>
          </Pressable>

          <Pressable style={styles.featureCard} onPress={() => router.push('/quizzes')}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>
                ✓
              </Text>
            </View>

            <Text style={styles.featureTitle}>
              Quiz
            </Text>

            <Text style={styles.featureSubtitle}>
              Practice without internet
            </Text>
          </Pressable>

          <Pressable style={styles.featureCard} onPress={() => router.push('/ai')}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>
                🤖
              </Text>
            </View>

            <Text style={styles.featureTitle}>
              Offline AI
            </Text>

            <Text style={styles.featureSubtitle}>
              Ask about downloaded content
            </Text>
          </Pressable>

          <Pressable style={styles.featureCard} onPress={() => router.push('/profile')}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>
                📊
              </Text>
            </View>

            <Text style={styles.featureTitle}>
              My Progress
            </Text>

            <Text style={styles.featureSubtitle}>
              Track your local progress
            </Text>
          </Pressable>

        </View>

        {/* Offline Notice */}
        <View style={styles.notice}>
          <Text style={styles.noticeIcon}>
            ✓
          </Text>

          <View style={styles.noticeContent}>
            <Text style={styles.noticeTitle}>
              You’re learning offline
            </Text>

            <Text style={styles.noticeText}>
              Your progress will be saved on this device
              and can be synchronized when you reconnect.
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpace} />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  header: {
    height: 92,
    paddingTop: 38,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E7E3',
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backArrow: {
    fontSize: 28,
    lineHeight: 28,
    color: '#315B42',
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#173C31',
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: '#7A837D',
  },

  offlineBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFF1D9',
  },

  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D79535',
    marginRight: 5,
  },

  offlineText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#956421',
  },

  scrollContent: {
    padding: 20,
  },

  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    borderRadius: 18,
    backgroundColor: '#E8F3E8',
    borderWidth: 1,
    borderColor: '#D4E5D3',
  },

  welcomeIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#D2E7D2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  welcomeIconText: {
    fontSize: 27,
    color: '#3E7950',
    fontWeight: '600',
  },

  welcomeContent: {
    flex: 1,
    marginLeft: 13,
  },

  welcomeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#244C34',
  },

  welcomeDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: '#64736A',
  },

  packCard: {
    marginTop: 18,
    padding: 17,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E0',
  },

  packHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  packTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#243A2C',
  },

  packSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#7B847E',
  },

  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#E7F3E8',
  },

  activeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#438054',
  },

  progressSection: {
    marginTop: 20,
  },

  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  progressLabel: {
    fontSize: 11,
    color: '#737D76',
  },

  progressValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F765C',
  },

  progressBackground: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E7EBE6',
    marginTop: 7,
    overflow: 'hidden',
  },

  progressFill: {
    width: '0%',
    height: '100%',
    backgroundColor: '#5F8068',
  },

  packInfo: {
    marginTop: 10,
    fontSize: 10,
    color: '#8A928D',
  },

  sectionTitle: {
    marginTop: 23,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#243A2C',
  },

  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E0',
  },

  numberCircle: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: '#DCEBDD',
    alignItems: 'center',
    justifyContent: 'center',
  },

  numberText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3F7650',
  },

  lessonContent: {
    flex: 1,
    marginLeft: 12,
  },

  lessonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#293A30',
  },

  lessonSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#818A84',
  },

  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5F8068',
    color: '#FFFFFF',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 12,
    paddingLeft: 2,
    overflow: 'hidden',
  },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  featureCard: {
    width: '48%',
    minHeight: 125,
    padding: 14,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E0',
  },

  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  featureIconText: {
    fontSize: 18,
  },

  featureTitle: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#293A30',
  },

  featureSubtitle: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 14,
    color: '#7C857F',
  },

  notice: {
    flexDirection: 'row',
    marginTop: 8,
    padding: 14,
    borderRadius: 15,
    backgroundColor: '#F0F5EF',
    borderWidth: 1,
    borderColor: '#DDE7DB',
  },

  noticeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D6E9D5',
    color: '#3F7650',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '700',
    overflow: 'hidden',
  },

  noticeContent: {
    flex: 1,
    marginLeft: 9,
  },

  noticeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#41614A',
  },

  noticeText: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 14,
    color: '#748078',
  },

  bottomSpace: {
    height: 25,
  },
});