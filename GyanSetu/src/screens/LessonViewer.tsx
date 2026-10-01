import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Markdown } from '@/components/Markdown';
import { useLocalData } from '@/hooks/useLocalData';
import { goBackOr } from '@/lib/nav';
import { getLesson, getNote, markLessonCompleted, recordLessonOpened, saveNote } from '@/services/learning';
import { selectOnline, useApp } from '@/stores/appStore';

function NotesEditor({ lessonId }: { lessonId: string }) {
  const { data: note } = useLocalData(() => getNote(lessonId), lessonId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  const toggle = () => {
    // Start editing from the latest saved text (it may have changed via sync).
    if (!open) setText(note?.text ?? '');
    setOpen(!open);
    setSaved(false);
  };

  const save = async () => {
    await saveNote(lessonId, text);
    setSaved(true);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.actionButton} onPress={toggle}>
        <Text style={styles.actionIcon}>
          📝
        </Text>

        <View style={styles.actionTextContainer}>
          <Text style={styles.actionTitle}>
            {note ? 'My Notes' : 'Add Notes'}
          </Text>

          <Text style={styles.actionSubtitle} numberOfLines={open ? undefined : 2}>
            {saved ? 'Saved on this phone ✓' : note ? note.text : 'Save your personal notes'}
          </Text>
        </View>

        <Text style={styles.arrow}>
          {open ? '⌄' : '›'}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.noteEditor}>
          <TextInput
            style={styles.noteInput}
            value={text}
            onChangeText={setText}
            placeholder="Write anything you want to remember…"
            placeholderTextColor="#9AA39C"
            multiline
            maxLength={10000}
            autoFocus
          />
          <TouchableOpacity style={styles.noteSave} onPress={save}>
            <Text style={styles.noteSaveText}>{text.trim() ? 'Save note' : note ? 'Delete note' : 'Close'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

export default function LessonViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useApp(selectOnline);
  const { data } = useLocalData(() => getLesson(id), id);

  useEffect(() => {
    void recordLessonOpened(id);
  }, [id]);

  if (data === undefined) return <View style={styles.container} />;
  if (data === null) {
    return (
      <View style={[styles.container, styles.missing]}>
        <Text style={styles.sectionTitle}>This lesson isn’t on your phone</Text>
        <Text style={styles.paragraph}>Download the course to read it offline.</Text>
        <TouchableOpacity style={styles.completeButton} onPress={() => goBackOr('/courses')}>
          <Text style={styles.completeButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { lesson, courseTitle, index, total, previousId, nextId } = data;
  const completed = lesson.completed;
  const isFirstLesson = previousId === null;
  const isLastLesson = nextId === null;
  const progress = Math.round(((index + 1) / Math.max(1, total)) * 100);

  // replace (not push) so Back from any lesson returns to the course.
  const go = (lessonId: string | null) => lessonId && router.replace(`/lesson/${lessonId}`);

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackOr(`/course/${lesson.courseId}`)}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {courseTitle}
          </Text>

          <Text style={styles.offlineText}>
            {online ? '● Online' : '● Offline'}
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {/* PROGRESS */}
      <View style={styles.progressSection}>
        <View style={styles.progressTop}>
          <Text style={styles.progressLabel}>
            Lesson {index + 1} of {total}
          </Text>

          <Text style={styles.progressPercent}>
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
      </View>

      {/* CONTENT */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* TITLE */}
        <View style={styles.titleSection}>
          <Text style={styles.lessonNumber}>
            LESSON {lesson.position}
          </Text>

          <Text style={styles.lessonTitle}>
            {lesson.title}
          </Text>

          {lesson.durationMin != null && (
            <Text style={styles.lessonSubtitle}>
              About {lesson.durationMin} min read
            </Text>
          )}
        </View>

        {/* OFFLINE NOTICE */}
        <View style={styles.offlineCard}>
          <View style={styles.offlineIcon}>
            <Text style={styles.offlineIconText}>
              ✓
            </Text>
          </View>

          <View style={styles.offlineContent}>
            <Text style={styles.offlineTitle}>
              Available Offline
            </Text>

            <Text style={styles.offlineDescription}>
              {lesson.mediaOmitted
                ? 'Saved on your phone. The video is skipped in the Lite pack; download the full pack to watch it.'
                : 'This lesson is saved on your device and can be studied without an internet connection.'}
            </Text>
          </View>
        </View>

        {/* MAIN LESSON */}
        <View style={styles.card}>
          <Markdown source={lesson.bodyMd} skipFirstHeading />
        </View>

        {/* ACTIONS */}
        <View style={styles.actionsCard}>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push({ pathname: '/ai', params: { courseId: lesson.courseId } })}
          >
            <Text style={styles.actionIcon}>
              ✦
            </Text>

            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>
                Ask GyanSetu AI
              </Text>

              <Text style={styles.actionSubtitle}>
                Ask doubts about this lesson
              </Text>
            </View>

            <Text style={styles.arrow}>
              ›
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <NotesEditor lessonId={lesson.id} />

        </View>

        {/* COMPLETE */}
        <TouchableOpacity
          style={[
            styles.completeButton,
            completed && styles.completedButton,
          ]}
          onPress={() => markLessonCompleted(lesson.id)}
          disabled={completed}
        >
          <Text style={styles.completeButtonText}>
            {completed
              ? '✓  Lesson Completed'
              : '✓  Mark as Completed'}
          </Text>
        </TouchableOpacity>

        {/* PREVIOUS / NEXT */}
        <View style={styles.navigation}>

          <TouchableOpacity
            style={[
              styles.previousButton,
              isFirstLesson && styles.disabledButton,
            ]}
            onPress={() => go(previousId)}
            disabled={isFirstLesson}
          >
            <Text
              style={[
                styles.previousIcon,
                isFirstLesson && styles.disabledText,
              ]}
            >
              ‹
            </Text>

            <View>
              <Text style={styles.navSmallText}>
                PREVIOUS
              </Text>

              <Text
                style={[
                  styles.navText,
                  isFirstLesson && styles.disabledText,
                ]}
              >
                Previous Lesson
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nextButton,
              isLastLesson && styles.disabledButton,
            ]}
            onPress={() => go(nextId)}
            disabled={isLastLesson}
          >
            <View>
              <Text style={styles.navSmallText}>
                NEXT
              </Text>

              <Text
                style={[
                  styles.navText,
                  isLastLesson && styles.disabledText,
                ]}
              >
                Next Lesson
              </Text>
            </View>

            <Text
              style={[
                styles.nextIcon,
                isLastLesson && styles.disabledText,
              ]}
            >
              ›
            </Text>
          </TouchableOpacity>

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

  noteEditor: {
    paddingBottom: 12,
  },

  noteInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#E1E5DF',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#29392C',
    textAlignVertical: 'top',
    backgroundColor: '#FBFAF6',
  },

  noteSave: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#4F7757',
  },

  noteSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#F8F4EA',
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

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#243326',
    textAlign: 'center',
  },

  offlineText: {
    marginTop: 3,
    fontSize: 11,
    color: '#5C7A61',
    fontWeight: '600',
  },

  headerSpacer: {
    width: 42,
  },

  progressSection: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#F8F4EA',
  },

  progressTop: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },

  progressLabel: {
    fontSize: 12,
    color: '#687267',
  },

  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#315C3A',
  },

  progressBackground: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DED9CC',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#5D8A65',
  },

  scrollView: {
    flex: 1,
    width: '100%',
  },

  content: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
  },

  titleSection: {
    width: '100%',
    marginBottom: 18,
  },

  lessonNumber: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#6B856E',
    marginBottom: 7,
  },

  lessonTitle: {
    width: '100%',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    color: '#26372A',
  },

  lessonSubtitle: {
    width: '100%',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#6B726B',
  },

  offlineCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#EAF3E8',
    borderWidth: 1,
    borderColor: '#D4E5D2',
  },

  offlineIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#5D8A65',
    marginRight: 12,
  },

  offlineIconText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  offlineContent: {
    flex: 1,
  },

  offlineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#315C3A',
    marginBottom: 4,
  },

  offlineDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: '#607064',
  },

  card: {
    width: '100%',
    padding: 18,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E3D9',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#29392C',
    marginBottom: 10,
  },

  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#606860',
    marginBottom: 16,
  },









  actionsCard: {
    width: '100%',
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E3D9',
    marginBottom: 16,
  },

  actionButton: {
    width: '100%',
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
  },

  actionIcon: {
    width: 38,
    fontSize: 21,
    textAlign: 'center',
    marginRight: 10,
  },

  actionTextContainer: {
    flex: 1,
  },

  actionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2E3C31',
    marginBottom: 3,
  },

  actionSubtitle: {
    fontSize: 11,
    color: '#7A817A',
  },

  arrow: {
    fontSize: 25,
    color: '#708171',
    marginLeft: 8,
  },

  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#ECE8DF',
  },

  completeButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4F7757',
    marginBottom: 18,
  },

  completedButton: {
    backgroundColor: '#315C3A',
  },

  completeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  navigation: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  previousButton: {
    flex: 1,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E0D6',
  },

  nextButton: {
    flex: 1,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E0D6',
  },

  disabledButton: {
    opacity: 0.45,
  },

  previousIcon: {
    fontSize: 28,
    color: '#4F7757',
    marginRight: 7,
  },

  nextIcon: {
    fontSize: 28,
    color: '#4F7757',
    marginLeft: 7,
  },

  disabledText: {
    color: '#9B9F9B',
  },

  navSmallText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#879087',
    marginBottom: 3,
  },

  navText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B493E',
  },

  bottomSpace: {
    height: 25,
  },
});