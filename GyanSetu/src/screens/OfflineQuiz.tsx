import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useLocalData } from '@/hooks/useLocalData';
import { goBackOr } from '@/lib/nav';
import { getQuiz, recordQuizAttempt } from '@/services/learning';
import { useApp } from '@/stores/appStore';

export default function OfflineQuiz() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: quiz } = useLocalData(() => getQuiz(id), id);
  const authed = useApp((s) => s.sessionStatus === 'authed');

  const startedAt = useRef(new Date().toISOString());
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number }[]>([]);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  const onBack = () => goBackOr('/quizzes');

  if (quiz === undefined) return <SafeAreaView style={styles.container} />;
  if (quiz === null || quiz.questions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Quiz not available</Text>
          <Text style={styles.resultSubtitle}>Download the course to take this quiz offline.</Text>
          <Pressable style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const questions = quiz.questions;
  const question = questions[currentQuestion];

  const handleNext = async () => {
    if (selectedAnswer === null) return;

    const nextAnswers = [...answers, { questionId: question.id, selectedIndex: selectedAnswer }];
    setAnswers(nextAnswers);

    if (currentQuestion === questions.length - 1) {
      setResult(await recordQuizAttempt(quiz.id, questions, nextAnswers, startedAt.current));
      return;
    }

    setCurrentQuestion((previous) => previous + 1);
    setSelectedAnswer(null);
  };

  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.resultContainer}>

          <Text style={styles.resultIcon}>✓</Text>

          <Text style={styles.resultTitle}>
            Quiz Completed
          </Text>

          <Text style={styles.resultSubtitle}>
            {authed
              ? 'Your result is saved and will sync to your account.'
              : 'Your result is saved on this phone.'}
          </Text>

          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>
              Your Score
            </Text>

            <Text style={styles.score}>
              {result.score}/{result.total}
            </Text>

            <Text style={styles.offlineLabel}>
              ● Saved Offline
            </Text>
          </View>

          {/* Review */}
          {questions.map((q, i) => {
            const picked = answers[i]?.selectedIndex;
            const right = picked === q.correctIndex;
            return (
              <View key={q.id} style={styles.reviewCard}>
                <Text style={styles.reviewQuestion}>{i + 1}. {q.prompt}</Text>
                <Text style={[styles.reviewAnswer, right ? styles.reviewRight : styles.reviewWrong]}>
                  {right ? '✓ ' : '✗ '}
                  {q.options[picked ?? 0]}
                </Text>
                {!right && <Text style={styles.reviewCorrect}>Correct: {q.options[q.correctIndex]}</Text>}
                {q.explanation && <Text style={styles.reviewExplanation}>{q.explanation}</Text>}
              </View>
            );
          })}

          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace('/dashboard')}
          >
            <Text style={styles.primaryButtonText}>
              Back to Dashboard
            </Text>
          </Pressable>

        </ScrollView>
      </SafeAreaView>
    );
  }

  const progress =
    ((currentQuestion + 1) / questions.length) * 100;

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {quiz.title}
          </Text>

          <Text style={styles.headerSubtitle}>
            Offline Mode
          </Text>
        </View>
      </View>

      {/* Offline Banner */}
      <View style={styles.offlineBanner}>
        <View style={styles.greenDot} />

        <Text style={styles.offlineText}>
          Offline quiz • Your answers are saved locally
        </Text>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressTop}>
          <Text style={styles.questionNumber}>
            Question {currentQuestion + 1} of {questions.length}
          </Text>

          <Text style={styles.progressPercent}>
            {Math.round(progress)}%
          </Text>
        </View>

        <View style={styles.progressBackground}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
        </View>
      </View>

      {/* Question */}
      <View style={styles.questionCard}>
        <Text style={styles.question}>
          {question.prompt}
        </Text>

        <View style={styles.options}>
          {question.options.map((option, index) => {
            const selected =
              selectedAnswer === index;

            return (
              <Pressable
                key={`${question.id}-${index}`}
                style={[
                  styles.option,
                  selected && styles.selectedOption,
                ]}
                onPress={() =>
                  setSelectedAnswer(index)
                }
              >
                <View
                  style={[
                    styles.optionCircle,
                    selected &&
                      styles.selectedOptionCircle,
                  ]}
                >
                  {selected && (
                    <View style={styles.innerCircle} />
                  )}
                </View>

                <Text
                  style={[
                    styles.optionText,
                    selected &&
                      styles.selectedOptionText,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Next */}
      <Pressable
        disabled={selectedAnswer === null}
        style={[
          styles.nextButton,
          selectedAnswer === null &&
            styles.disabledButton,
        ]}
        onPress={handleNext}
      >
        <Text style={styles.nextButtonText}>
          {currentQuestion === questions.length - 1
            ? 'Finish Quiz'
            : 'Next Question'}
        </Text>

        <Text style={styles.nextArrow}>
          →
        </Text>
      </Pressable>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerText: {
    flex: 1,
  },

  reviewCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E3D9',
    padding: 14,
    marginBottom: 10,
  },

  reviewQuestion: {
    fontSize: 14,
    fontWeight: '700',
    color: '#29392C',
    marginBottom: 6,
  },

  reviewAnswer: {
    fontSize: 13,
    fontWeight: '600',
  },

  reviewRight: {
    color: '#2F7A47',
  },

  reviewWrong: {
    color: '#B3261E',
  },

  reviewCorrect: {
    fontSize: 13,
    color: '#2F7A47',
    marginTop: 4,
  },

  reviewExplanation: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6A746C',
    marginTop: 6,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 18,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF1E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backText: {
    fontSize: 30,
    color: '#365C48',
    marginTop: -3,
  },

  headerTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#173C31',
  },

  headerSubtitle: {
    fontSize: 12,
    color: '#708077',
    marginTop: 2,
  },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F3E5',
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 20,
  },

  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B8D5A',
    marginRight: 9,
  },

  offlineText: {
    flex: 1,
    fontSize: 12,
    color: '#41634C',
  },

  progressSection: {
    marginTop: 25,
  },

  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  questionNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#526158',
  },

  progressPercent: {
    fontSize: 12,
    color: '#63816B',
    fontWeight: '600',
  },

  progressBackground: {
    height: 7,
    borderRadius: 5,
    backgroundColor: '#DDE5DA',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#5F8068',
    borderRadius: 5,
  },

  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 22,
    borderWidth: 1,
    borderColor: '#E4E8E1',
  },

  question: {
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '700',
    color: '#173C31',
    marginBottom: 22,
  },

  options: {
    gap: 11,
  },

  option: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE2DB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  selectedOption: {
    backgroundColor: '#EDF5EB',
    borderColor: '#6E9477',
  },

  optionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#A8B3AA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  selectedOptionCircle: {
    borderColor: '#4F765C',
  },

  innerCircle: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#4F765C',
  },

  optionText: {
    flex: 1,
    fontSize: 14,
    color: '#536059',
  },

  selectedOptionText: {
    color: '#31563C',
    fontWeight: '600',
  },

  nextButton: {
    height: 55,
    borderRadius: 16,
    backgroundColor: '#5F8068',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  disabledButton: {
    opacity: 0.45,
  },

  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  nextArrow: {
    color: '#FFFFFF',
    fontSize: 20,
    marginLeft: 10,
  },

  resultContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  resultIcon: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#E3F1E2',
    color: '#3B8050',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 42,
    fontWeight: '700',
    overflow: 'hidden',
    marginBottom: 20,
  },

  resultTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#173C31',
  },

  resultSubtitle: {
    fontSize: 13,
    color: '#737A74',
    marginTop: 7,
  },

  scoreCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 25,
    marginTop: 30,
    borderWidth: 1,
    borderColor: '#E1E7DF',
  },

  scoreLabel: {
    fontSize: 13,
    color: '#7A837D',
  },

  score: {
    fontSize: 42,
    fontWeight: '800',
    color: '#315D42',
    marginTop: 5,
  },

  offlineLabel: {
    fontSize: 12,
    color: '#4E855C',
    marginTop: 8,
  },

  primaryButton: {
    width: '100%',
    height: 55,
    borderRadius: 16,
    backgroundColor: '#5F8068',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
