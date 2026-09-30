import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

import {
  getCourseProgress,
  getLessonProgress,
} from '../db/database';

type CourseDetailsProps = {
  courseName: string;
  onBack: () => void;
  onLessonPress: (lessonId: string) => void;
};

const lessons = [
  {
    id: 'lesson-1',
    title: 'Introduction to the Course',
    duration: '12 min',
  },
  {
    id: 'lesson-2',
    title: 'Core Concepts',
    duration: '15 min',
  },
  {
    id: 'lesson-3',
    title: 'Working with Examples',
    duration: '18 min',
  },
  {
    id: 'lesson-4',
    title: 'Practice and Application',
    duration: '20 min',
  },
  {
    id: 'lesson-5',
    title: 'Lesson Summary',
    duration: '10 min',
  },
];

export default function CourseDetails({
  courseName,
  onBack,
  onLessonPress,
}: CourseDetailsProps) {
  const [completedLessons, setCompletedLessons] =
    React.useState(0);

  const [progress, setProgress] = React.useState(0);

  const [completedLessonIds, setCompletedLessonIds] =
    React.useState<string[]>([]);

  const loadProgress = () => {
    // Overall course progress
    const courseProgress = getCourseProgress(courseName);

    setCompletedLessons(courseProgress.completed);
    setProgress(courseProgress.percentage);

    // Individual lesson progress
    const completedIds = lessons
      .filter((lesson) => {
        const savedProgress = getLessonProgress(
          courseName,
          lesson.id
        );

        return savedProgress?.completed === 1;
      })
      .map((lesson) => lesson.id);

    setCompletedLessonIds(completedIds);
  };

  React.useEffect(() => {
    loadProgress();
  }, [courseName]);

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Course Details
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* COURSE HERO */}
        <View style={styles.heroCard}>

          <View style={styles.courseIcon}>
            <Text style={styles.courseIconText}>
              {courseName === 'DSA'
                ? '⌘'
                : courseName === 'DBMS'
                ? '▣'
                : courseName === 'Computer Networks'
                ? '⌁'
                : courseName === 'Operating System'
                ? '⚙'
                : '◈'}
            </Text>
          </View>

          <Text style={styles.courseTitle}>
            {courseName}
          </Text>

          <Text style={styles.courseDescription}>
            Build strong fundamentals and continue learning
            even when you are offline.
          </Text>

          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>
              ✓ Available Offline
            </Text>
          </View>

          <View style={styles.courseMeta}>

            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                5
              </Text>

              <Text style={styles.metaLabel}>
                Lessons
              </Text>
            </View>

            <View style={styles.metaDivider} />

            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                75 min
              </Text>

              <Text style={styles.metaLabel}>
                Duration
              </Text>
            </View>

            <View style={styles.metaDivider} />

            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                Offline
              </Text>

              <Text style={styles.metaLabel}>
                Mode
              </Text>
            </View>

          </View>
        </View>

        {/* PROGRESS CARD */}
        <View style={styles.progressCard}>

          <View style={styles.progressHeader}>

            <View>
              <Text style={styles.progressTitle}>
                Your Progress
              </Text>

              <Text style={styles.progressSubtitle}>
                {completedLessons} of {lessons.length} lessons completed
              </Text>
            </View>

            <Text style={styles.progressPercentage}>
              {progress}%
            </Text>

          </View>

          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                },
              ]}
            />
          </View>

          <Text style={styles.progressHint}>
            {progress === 100
              ? 'Course completed! 🎉'
              : progress === 0
              ? 'Start your first lesson to begin.'
              : 'Keep going — your progress is saved offline.'}
          </Text>

        </View>

        {/* DOWNLOAD CARD */}
        <View style={styles.downloadCard}>

          <View style={styles.downloadIcon}>
            <Text style={styles.downloadIconText}>
              ↓
            </Text>
          </View>

          <View style={styles.downloadContent}>
            <Text style={styles.downloadTitle}>
              Learning Pack
            </Text>

            <Text style={styles.downloadDescription}>
              Lessons are available locally for offline learning.
            </Text>
          </View>

          <View style={styles.downloadStatus}>
            <Text style={styles.downloadStatusText}>
              Ready
            </Text>
          </View>

        </View>

        {/* LESSON HEADER */}
        <View style={styles.sectionHeader}>

          <View>
            <Text style={styles.sectionTitle}>
              Lessons
            </Text>

            <Text style={styles.sectionSubtitle}>
              Continue where you left off
            </Text>
          </View>

        </View>

        {/* LESSONS */}
        <View style={styles.lessonsCard}>

          {lessons.map((lesson, index) => {

            // IMPORTANT:
            // Check this exact lesson in SQLite.
            const isCompleted =
              completedLessonIds.includes(lesson.id);

            return (
              <React.Fragment key={lesson.id}>

                <TouchableOpacity
                  style={styles.lessonRow}
                  onPress={() => {
                    onLessonPress(lesson.id);
                  }}
                >

                  {/* NUMBER / CHECK */}
                  <View
                    style={[
                      styles.lessonNumber,
                      isCompleted &&
                        styles.lessonNumberCompleted,
                    ]}
                  >
                    {isCompleted ? (
                      <Text style={styles.completedIcon}>
                        ✓
                      </Text>
                    ) : (
                      <Text style={styles.lessonNumberText}>
                        {index + 1}
                      </Text>
                    )}
                  </View>

                  {/* LESSON INFO */}
                  <View style={styles.lessonInfo}>

                    <Text style={styles.lessonTitle}>
                      {lesson.title}
                    </Text>

                    <Text style={styles.lessonDuration}>
                      {lesson.duration}
                      {'  •  '}
                      {isCompleted
                        ? 'Completed'
                        : 'Available Offline'}
                    </Text>

                  </View>

                  {/* ARROW */}
                  <Text style={styles.lessonArrow}>
                    ›
                  </Text>

                </TouchableOpacity>

                {index < lessons.length - 1 && (
                  <View style={styles.lessonDivider} />
                )}

              </React.Fragment>
            );
          })}

        </View>

        {/* INFO */}
        <View style={styles.infoCard}>

          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>
              i
            </Text>
          </View>

          <View style={styles.infoContent}>

            <Text style={styles.infoTitle}>
              Learning continues offline
            </Text>

            <Text style={styles.infoText}>
              Your lesson progress is saved on your device.
              You can continue studying without an internet
              connection.
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
    backgroundColor: '#F8F4EA',
  },

  header: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E1D4',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  backText: {
    fontSize: 32,
    lineHeight: 34,
    color: '#315C3A',
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: '#26372A',
  },

  headerSpacer: {
    width: 42,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
  },

  heroCard: {
    width: '100%',
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E3D9',
    marginBottom: 16,
  },

  courseIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF2E7',
    marginBottom: 14,
  },

  courseIconText: {
    fontSize: 25,
    fontWeight: '700',
    color: '#4F7757',
  },

  courseTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#26372A',
    marginBottom: 7,
  },

  courseDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: '#687068',
    marginBottom: 13,
  },

  offlineBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EAF3E8',
    marginBottom: 18,
  },

  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F7757',
  },

  courseMeta: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#ECE8DF',
  },

  metaItem: {
    flex: 1,
    alignItems: 'center',
  },

  metaValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#344337',
    marginBottom: 3,
  },

  metaLabel: {
    fontSize: 10,
    color: '#7B837B',
  },

  metaDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E6E1D7',
  },

  progressCard: {
    width: '100%',
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#EEF4E9',
    borderWidth: 1,
    borderColor: '#D9E6D5',
    marginBottom: 16,
  },

  progressHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  progressTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#315C3A',
    marginBottom: 4,
  },

  progressSubtitle: {
    fontSize: 11,
    color: '#6A756B',
  },

  progressPercentage: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4F7757',
  },

  progressBackground: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D8E2D5',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#5D8A65',
  },

  progressHint: {
    marginTop: 10,
    fontSize: 11,
    color: '#687468',
  },

  downloadCard: {
    width: '100%',
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E3D9',
    marginBottom: 22,
  },

  downloadIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF2E7',
    marginRight: 12,
  },

  downloadIconText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4F7757',
  },

  downloadContent: {
    flex: 1,
  },

  downloadTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334135',
    marginBottom: 3,
  },

  downloadDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: '#7A817A',
  },

  downloadStatus: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EAF3E8',
  },

  downloadStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F7757',
  },

  sectionHeader: {
    width: '100%',
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#29392C',
    marginBottom: 3,
  },

  sectionSubtitle: {
    fontSize: 11,
    color: '#7A817A',
  },

  lessonsCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E3D9',
    paddingHorizontal: 15,
    marginBottom: 16,
  },

  lessonRow: {
    width: '100%',
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
  },

  lessonNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0EEE7',
    marginRight: 12,
  },

  lessonNumberCompleted: {
    backgroundColor: '#DCEBDD',
  },

  lessonNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#687268',
  },

  completedIcon: {
    fontSize: 17,
    fontWeight: '800',
    color: '#4F7757',
  },

  lessonInfo: {
    flex: 1,
    paddingRight: 8,
  },

  lessonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#354238',
    marginBottom: 4,
  },

  lessonDuration: {
    fontSize: 10,
    color: '#7D857D',
  },

  lessonArrow: {
    fontSize: 25,
    color: '#829083',
  },

  lessonDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#ECE8DF',
  },

  infoCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
    borderRadius: 17,
    backgroundColor: '#F1EEE5',
    borderWidth: 1,
    borderColor: '#E3DDD0',
  },

  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#DDE8DA',
    marginRight: 10,
  },

  infoIconText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F7757',
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#405044',
    marginBottom: 4,
  },

  infoText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#737A73',
  },

  bottomSpace: {
    height: 25,
  },
});