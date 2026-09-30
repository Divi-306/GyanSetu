import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {
  markLessonCompleted,
  getLessonProgress,
} from '../db/database';

type LessonViewerProps = {
  courseName: string;
  lessonId: string;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onAskAI: () => void;
};

const lessonData: Record<
  string,
  {
    number: string;
    title: string;
    subtitle: string;
    introduction: string;
    conceptTitle: string;
    conceptText: string;
    points: string[];
  }
> = {
  'lesson-1': {
    number: 'LESSON 1',
    title: 'Introduction to the Course',
    subtitle: 'Understand the basic foundation and terminology.',
    introduction:
      'In this lesson, you will understand the basic concepts required to begin learning this course. Start by becoming familiar with the important terminology and core ideas.',
    conceptTitle: 'Build the fundamentals first',
    conceptText:
      'Strong fundamentals make it easier to understand advanced concepts and solve practical problems.',
    points: [
      'Understand the basic terminology and concepts.',
      'Learn why the subject is important.',
      'Build a foundation for upcoming lessons.',
    ],
  },

  'lesson-2': {
    number: 'LESSON 2',
    title: 'Core Concepts',
    subtitle: 'Explore the fundamental concepts in more detail.',
    introduction:
      'This lesson takes the concepts introduced earlier and explains how they work together. Focus on understanding the logic instead of memorising definitions.',
    conceptTitle: 'Understand, then practice',
    conceptText:
      'Conceptual understanding helps you apply what you learn to new problems.',
    points: [
      'Understand the core concepts.',
      'Connect different concepts together.',
      'Practice using simple examples.',
    ],
  },

  'lesson-3': {
    number: 'LESSON 3',
    title: 'Working with Examples',
    subtitle: 'Learn through practical examples and situations.',
    introduction:
      'Examples help convert theoretical knowledge into practical understanding. Study each example carefully and identify the concept being applied.',
    conceptTitle: 'Learn by doing',
    conceptText:
      'Practical examples make abstract concepts easier to understand and remember.',
    points: [
      'Study the example step by step.',
      'Identify the concept being used.',
      'Try solving a similar problem yourself.',
    ],
  },

  'lesson-4': {
    number: 'LESSON 4',
    title: 'Practice and Application',
    subtitle: 'Apply your knowledge to solve problems.',
    introduction:
      'Now apply the concepts you have learned. Practice helps identify gaps in understanding and improves your ability to solve problems independently.',
    conceptTitle: 'Practice builds confidence',
    conceptText:
      'Regular practice improves problem-solving ability and makes concepts easier to recall.',
    points: [
      'Solve practice problems.',
      'Identify and correct mistakes.',
      'Apply concepts without depending on examples.',
    ],
  },

  'lesson-5': {
    number: 'LESSON 5',
    title: 'Lesson Summary',
    subtitle: 'Review the important concepts from the course.',
    introduction:
      'This lesson brings together the important ideas covered so far. Use this section for revision before moving to quizzes or advanced topics.',
    conceptTitle: 'Revise before moving ahead',
    conceptText:
      'Revision strengthens your understanding and helps you retain important concepts.',
    points: [
      'Review the important concepts.',
      'Check what you can explain independently.',
      'Prepare yourself for the next topic or quiz.',
    ],
  },
};

export default function LessonViewer({
  courseName,
  lessonId,
  onBack,
  onPrevious,
  onNext,
  onAskAI,
}: LessonViewerProps) {
  const lesson = lessonData[lessonId] || lessonData['lesson-1'];

  const [completed, setCompleted] = React.useState(false);
  React.useEffect(() => {
  const savedProgress = getLessonProgress(
    courseName,
    lessonId
  );

  if (savedProgress?.completed === 1) {
    setCompleted(true);
  } else {
    setCompleted(false);
  }
}, [courseName, lessonId]);
  const lessonNumber = Number(
    lesson.number.replace('LESSON ', '')
  );

  const isFirstLesson = lessonNumber === 1;
  const isLastLesson = lessonNumber === 5;

  const progress = lessonNumber * 20;

  const handleComplete = () => {
    markLessonCompleted(courseName, lessonId);
    setCompleted(true);
  };

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {courseName}
          </Text>

          <Text style={styles.offlineText}>
            ● Offline
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {/* PROGRESS */}
      <View style={styles.progressSection}>
        <View style={styles.progressTop}>
          <Text style={styles.progressLabel}>
            Lesson Progress
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
      >

        {/* TITLE */}
        <View style={styles.titleSection}>
          <Text style={styles.lessonNumber}>
            {lesson.number}
          </Text>

          <Text style={styles.lessonTitle}>
            {lesson.title}
          </Text>

          <Text style={styles.lessonSubtitle}>
            {lesson.subtitle}
          </Text>
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
              This lesson is saved on your device and can be
              studied without an internet connection.
            </Text>
          </View>
        </View>

        {/* MAIN LESSON */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            What you will learn
          </Text>

          <Text style={styles.paragraph}>
            {lesson.subtitle}
          </Text>

          <Text style={styles.sectionTitle}>
            Introduction
          </Text>

          <Text style={styles.paragraph}>
            {lesson.introduction}
          </Text>
        </View>

        {/* KEY CONCEPT */}
        <View style={styles.conceptCard}>
          <Text style={styles.conceptLabel}>
            KEY CONCEPT
          </Text>

          <Text style={styles.conceptTitle}>
            {lesson.conceptTitle}
          </Text>

          <Text style={styles.conceptText}>
            {lesson.conceptText}
          </Text>
        </View>

        {/* KEY POINTS */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Key Points
          </Text>

          {lesson.points.map((point, index) => (
            <View
              key={index}
              style={styles.point}
            >
              <View style={styles.pointNumber}>
                <Text style={styles.pointNumberText}>
                  {index + 1}
                </Text>
              </View>

              <Text style={styles.pointText}>
                {point}
              </Text>
            </View>
          ))}
        </View>

        {/* ACTIONS */}
        <View style={styles.actionsCard}>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={onAskAI}
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

          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionIcon}>
              📝
            </Text>

            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>
                Add Notes
              </Text>

              <Text style={styles.actionSubtitle}>
                Save your personal notes
              </Text>
            </View>

            <Text style={styles.arrow}>
              ›
            </Text>
          </TouchableOpacity>

        </View>

        {/* COMPLETE */}
        <TouchableOpacity
          style={[
            styles.completeButton,
            completed && styles.completedButton,
          ]}
          onPress={handleComplete}
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
            onPress={onPrevious}
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
            onPress={onNext}
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

  conceptCard: {
    width: '100%',
    padding: 18,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: '#EEF4E9',
    borderWidth: 1,
    borderColor: '#D9E6D5',
  },

  conceptLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#6B856E',
    marginBottom: 6,
  },

  conceptTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#315C3A',
    marginBottom: 7,
  },

  conceptText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5E6D60',
  },

  point: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  pointNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EAF2E7',
    marginRight: 10,
  },

  pointNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4D7555',
  },

  pointText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#626A63',
    paddingTop: 3,
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