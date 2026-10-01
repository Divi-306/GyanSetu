import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { db } from '@/db';
import { useLocalData } from '@/hooks/useLocalData';
import { usePublishScreen } from '@/navigator/store';
import { goBackOr } from '@/lib/nav';
import { listStarterCourses } from '@/services/learning';

async function loadStarter() {
  const courses = await listStarterCourses();
  const progress = await db.getAllAsync<{ course_id: string; percent: number }>('SELECT course_id, percent FROM course_progress');
  const pct = new Map(progress.map((p) => [p.course_id, p.percent]));
  return courses.map((c) => ({ ...c, percent: pct.get(c.id) ?? 0 }));
}

export default function StarterBundle() {
  const { data } = useLocalData(loadStarter);
  const starterCourses = useMemo(() => data ?? [], [data]);
  const screenItems = useMemo(() => starterCourses.map((c) => ({ title: c.title, href: `/course/${c.id}` as const })), [starterCourses]);
  usePublishScreen(screenItems);
  const onBack = () => goBackOr('/courses');
  const onCoursePress = (course: { id: string }) => router.push(`/course/${course.id}`);

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>

        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backArrow}>
            ‹
          </Text>
        </Pressable>

        <View>
          <Text style={styles.title}>
            Starter Bundle
          </Text>

          <Text style={styles.subtitle}>
            Explore courses without an account
          </Text>
        </View>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >

        {/* Intro */}
        <View style={styles.introCard}>

          <View style={styles.introIcon}>
            <Text style={styles.introEmoji}>
              🎁
            </Text>
          </View>

          <View style={styles.introContent}>

            <Text style={styles.introTitle}>
              Welcome to the Starter Bundle
            </Text>

            <Text style={styles.introText}>
              Explore sample lessons and demo quizzes
              from different subjects — no login required.
            </Text>

          </View>

        </View>

        {/* Offline */}
        <View style={styles.offlineRow}>
          <View style={styles.dot} />

          <Text style={styles.offlineText}>
            Starter content available offline
          </Text>
        </View>

        {/* Heading */}
        <View style={styles.sectionHeader}>

          <View>
            <Text style={styles.sectionTitle}>
              Explore Courses
            </Text>

            <Text style={styles.sectionSubtitle}>
              Choose a subject to start learning
            </Text>
          </View>

          <Text style={styles.count}>
            {starterCourses.length} courses
          </Text>

        </View>

        {/* Courses */}
        {starterCourses.map((course) => (
          <Pressable
            key={course.id}
            style={styles.courseCard}
            onPress={() => onCoursePress(course)}
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

              <Text style={styles.courseDescription}>
                {course.description}
              </Text>

              <View style={styles.metaRow}>

                <Text style={styles.metaText}>
                  {course.sampleLessons} demo lesson{course.sampleLessons === 1 ? '' : 's'}
                </Text>

                {course.hasQuiz && (
                  <>
                    <Text style={styles.separator}>
                      •
                    </Text>

                    <Text style={styles.metaText}>
                      Demo quiz
                    </Text>
                  </>
                )}

              </View>

              <View style={styles.progressBackground}>
                <View style={[styles.progressFill, { width: `${course.percent}%` }]} />
              </View>

            </View>

            <Text style={styles.arrow}>
              →
            </Text>

          </Pressable>
        ))}

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
    paddingTop: 38,
    paddingHorizontal: 18,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E8E3',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF4ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backArrow: {
    fontSize: 31,
    color: '#315B42',
    marginTop: -3,
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#173C31',
  },

  subtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#7A837D',
  },

  content: {
    padding: 17,
  },

  introCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#E8F3E8',
    borderWidth: 1,
    borderColor: '#D4E5D3',
  },

  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#D4E8D4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  introEmoji: {
    fontSize: 23,
  },

  introContent: {
    flex: 1,
    marginLeft: 12,
  },

  introTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#244C34',
  },

  introText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: '#64736A',
  },

  offlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3F8A59',
    marginRight: 7,
  },

  offlineText: {
    fontSize: 11,
    color: '#637169',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 21,
    marginBottom: 11,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#243A2C',
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#7B857E',
  },

  count: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4D7659',
  },

  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    marginBottom: 10,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E0',
  },

  courseIcon: {
    width: 55,
    height: 55,
    borderRadius: 16,
    backgroundColor: '#EEF5EC',
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
    color: '#293B2F',
  },

  courseDescription: {
    marginTop: 3,
    fontSize: 10,
    color: '#7A847D',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  metaText: {
    fontSize: 8.5,
    color: '#7A857E',
  },

  separator: {
    marginHorizontal: 5,
    color: '#A1A8A2',
  },

  progressBackground: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5EAE5',
    marginTop: 7,
  },

  progressFill: {
    width: '0%',
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4D9562',
  },

  arrow: {
    marginLeft: 8,
    fontSize: 21,
    color: '#64806B',
  },
});