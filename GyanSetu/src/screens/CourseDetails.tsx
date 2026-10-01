import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLocalData } from '@/hooks/useLocalData';
import { errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { goBackOr } from '@/lib/nav';
import { getCourse, type CourseDetail } from '@/services/learning';
import { downloadCoursePack, PackError, removeCoursePack, useDownloads } from '@/services/packs';
import { selectOnline, useApp } from '@/stores/appStore';

function DownloadCard({ course }: { course: CourseDetail }) {
  const online = useApp(selectOnline);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const progress = useDownloads((s) => s.active[course.id]);
  const [error, setError] = useState<string | null>(null);

  const start = async (variant: 'full' | 'lite') => {
    setError(null);
    try {
      await downloadCoursePack(course.id, variant);
    } catch (err) {
      setError(err instanceof PackError ? err.message : errorMessage(err));
    }
  };

  const confirmRemove = () =>
    Alert.alert(
      'Remove download?',
      'The downloaded lessons and videos will be deleted from this phone. Your progress is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void removeCoursePack(course.id) },
      ],
    );

  const pack = course.pack?.state === 'ACTIVE' ? course.pack : null;
  const updateAvailable = Boolean(pack && course.serverPackVersion && course.serverPackVersion > pack.version);

  let title = 'Learning Pack';
  let description: string;
  let status: string;
  let actions: React.ReactNode = null;

  if (!course.inCatalog) {
    description = 'Sample course from the Starter Bundle. All its lessons are on this phone.';
    status = 'Offline';
  } else if (progress) {
    const pct = Math.floor((100 * progress.receivedBytes) / Math.max(1, progress.totalBytes));
    description = `Downloading ${formatBytes(progress.receivedBytes)} of ${formatBytes(progress.totalBytes)}…`;
    status = `${pct}%`;
  } else if (pack) {
    title = `Learning Pack v${pack.version}${pack.variant === 'lite' ? ' (Lite)' : ''}`;
    description = updateAvailable
      ? `Version ${course.serverPackVersion} is available. Your progress carries over.`
      : `Downloaded • ${formatBytes(pack.sizeBytes)} on this phone.`;
    status = updateAvailable ? 'Update' : 'Ready';
    actions = (
      <View style={styles.packActions}>
        {updateAvailable && (
          <TouchableOpacity style={styles.packButton} disabled={!online} onPress={() => start(pack.variant as 'full' | 'lite')}>
            <Text style={styles.packButtonText}>{online ? 'Update' : 'Update when online'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.packButtonSecondary} onPress={confirmRemove}>
          <Text style={styles.packButtonSecondaryText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!authed) {
    description = 'Log in to download the full course for offline learning. Starter samples work without an account.';
    status = 'Login';
    actions = (
      <View style={styles.packActions}>
        <TouchableOpacity style={styles.packButton} onPress={() => router.push('/login')}>
          <Text style={styles.packButtonText}>Log in to download</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    description = online
      ? 'Download once, then learn without internet. Lite skips videos to save data and space.'
      : 'Connect to the internet to download this course.';
    status = 'Online';
    actions = (
      <View style={styles.packActions}>
        <TouchableOpacity style={[styles.packButton, !online && styles.packButtonDisabled]} disabled={!online} onPress={() => start('full')}>
          <Text style={styles.packButtonText}>Download • {formatBytes(course.fullSizeBytes)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.packButtonSecondary, !online && styles.packButtonDisabled]} disabled={!online} onPress={() => start('lite')}>
          <Text style={styles.packButtonSecondaryText}>Lite • {formatBytes(course.liteSizeBytes)}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.downloadCard}>
      <View style={styles.downloadRow}>
        <View style={styles.downloadIcon}>
          {progress ? (
            <ActivityIndicator color="#4F7757" />
          ) : (
            <Text style={styles.downloadIconText}>{pack ? '✓' : '↓'}</Text>
          )}
        </View>

        <View style={styles.downloadContent}>
          <Text style={styles.downloadTitle}>{title}</Text>
          <Text style={styles.downloadDescription}>{description}</Text>
        </View>

        <View style={styles.downloadStatus}>
          <Text style={styles.downloadStatusText}>{status}</Text>
        </View>
      </View>

      {actions}
      {error && <Text style={styles.downloadError}>{error}</Text>}
    </View>
  );
}

export default function CourseDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: course } = useLocalData(() => getCourse(id), id);

  if (course === undefined) return <View style={styles.container} />;

  if (course === null) {
    return (
      <View style={[styles.container, styles.missing]}>
        <Text style={styles.sectionTitle}>Course not available offline</Text>
        <Text style={styles.sectionSubtitle}>Connect to the internet and open Courses to load it.</Text>
        <TouchableOpacity style={styles.packButton} onPress={() => goBackOr('/courses')}>
          <Text style={styles.packButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const lessons = course.lessons;
  const completedLessons = lessons.filter((l) => l.completed).length;
  const totalMinutes = lessons.reduce((sum, l) => sum + (l.durationMin ?? 0), 0);
  const moreInFullCourse = Math.max(0, course.catalogLessonCount - lessons.length);
  const progress = course.percent;

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => goBackOr('/courses')}
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
              {course.icon ?? '◈'}
            </Text>
          </View>

          <Text style={styles.courseTitle}>
            {course.title}
          </Text>

          <Text style={styles.courseDescription}>
            {course.description ?? 'Build strong fundamentals and continue learning even when you are offline.'}
          </Text>

          {lessons.length > 0 && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>
                ✓ {lessons.length} lesson{lessons.length === 1 ? '' : 's'} available offline
              </Text>
            </View>
          )}

          <View style={styles.courseMeta}>

            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                {course.catalogLessonCount}
              </Text>

              <Text style={styles.metaLabel}>
                Lessons
              </Text>
            </View>

            <View style={styles.metaDivider} />

            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                {totalMinutes > 0 ? `${totalMinutes} min` : '—'}
              </Text>

              <Text style={styles.metaLabel}>
                Duration
              </Text>
            </View>

            <View style={styles.metaDivider} />

            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                {course.quizzes.length}
              </Text>

              <Text style={styles.metaLabel}>
                Quizzes
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
                {completedLessons} of {course.catalogLessonCount} lessons completed
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
        <DownloadCard course={course} />

        {/* LESSON HEADER */}
        <View style={styles.sectionHeader}>

          <View>
            <Text style={styles.sectionTitle}>
              Lessons
            </Text>

            <Text style={styles.sectionSubtitle}>
              {course.lastLessonId ? 'Continue where you left off' : 'Tap a lesson to start'}
            </Text>
          </View>

        </View>

        {/* LESSONS */}
        <View style={styles.lessonsCard}>

          {lessons.length === 0 && (
            <Text style={styles.emptyLessons}>
              No lessons on this phone yet. Download the course to study it offline.
            </Text>
          )}

          {lessons.map((lesson, index) => {
            const isCompleted = lesson.completed;

            return (
              <React.Fragment key={lesson.id}>

                <TouchableOpacity
                  style={styles.lessonRow}
                  onPress={() => router.push(`/lesson/${lesson.id}`)}
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
                        {lesson.position}
                      </Text>
                    )}
                  </View>

                  {/* LESSON INFO */}
                  <View style={styles.lessonInfo}>

                    <Text style={styles.lessonTitle}>
                      {lesson.title}
                    </Text>

                    <Text style={styles.lessonDuration}>
                      {lesson.durationMin ? `${lesson.durationMin} min` : 'Lesson'}
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

          {moreInFullCourse > 0 && lessons.length > 0 && (
            <>
              <View style={styles.lessonDivider} />
              <Text style={styles.emptyLessons}>
                + {moreInFullCourse} more lesson{moreInFullCourse === 1 ? '' : 's'} in the full course
              </Text>
            </>
          )}

        </View>

        {/* QUIZZES */}
        {course.quizzes.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Quizzes
              </Text>
              <Text style={styles.sectionSubtitle}>
                Scored on your phone, works offline
              </Text>
            </View>

            <View style={styles.lessonsCard}>
              {course.quizzes.map((quiz, index) => (
                <React.Fragment key={quiz.id}>
                  <TouchableOpacity
                    style={styles.lessonRow}
                    onPress={() => router.push(`/quiz/${quiz.id}`)}
                  >
                    <View style={styles.lessonNumber}>
                      <Text style={styles.lessonNumberText}>?</Text>
                    </View>
                    <View style={styles.lessonInfo}>
                      <Text style={styles.lessonTitle}>{quiz.title}</Text>
                      <Text style={styles.lessonDuration}>{quiz.questionCount} questions</Text>
                    </View>
                    <Text style={styles.lessonArrow}>›</Text>
                  </TouchableOpacity>
                  {index < course.quizzes.length - 1 && <View style={styles.lessonDivider} />}
                </React.Fragment>
              ))}
            </View>
          </>
        )}

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
  missing: {
    justifyContent: 'center',
    padding: 28,
  },

  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  packActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  packButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#4F7757',
    marginTop: 12,
    alignSelf: 'flex-start',
  },

  packButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  packButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#EAF3E8',
    marginTop: 12,
    alignSelf: 'flex-start',
  },

  packButtonSecondaryText: {
    color: '#4F7757',
    fontSize: 12,
    fontWeight: '700',
  },

  packButtonDisabled: {
    opacity: 0.5,
  },

  downloadError: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: '#B3261E',
  },

  emptyLessons: {
    paddingVertical: 16,
    fontSize: 12,
    lineHeight: 18,
    color: '#7A817A',
  },
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