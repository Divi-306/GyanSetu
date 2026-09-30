import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Question = {
  id: string;
  question: string;
  options: string[];
  answer: number;
};

const questions: Question[] = [
  {
    id: 'q1',
    question: 'Which data structure follows LIFO?',
    options: [
      'Queue',
      'Stack',
      'Linked List',
      'Graph',
    ],
    answer: 1,
  },
  {
    id: 'q2',
    question: 'What is the time complexity of accessing an array element by index?',
    options: [
      'O(n)',
      'O(log n)',
      'O(1)',
      'O(n²)',
    ],
    answer: 2,
  },
  {
    id: 'q3',
    question: 'Which data structure follows FIFO?',
    options: [
      'Stack',
      'Tree',
      'Queue',
      'Graph',
    ],
    answer: 2,
  },
  {
    id: 'q4',
    question: 'Which traversal uses the Root → Left → Right order?',
    options: [
      'Inorder',
      'Postorder',
      'Preorder',
      'Level Order',
    ],
    answer: 2,
  },
  {
    id: 'q5',
    question: 'Which one is a linear data structure?',
    options: [
      'Tree',
      'Graph',
      'Array',
      'Heap',
    ],
    answer: 2,
  },
];

type OfflineQuizProps = {
  onBack: () => void;
};

export default function OfflineQuiz({
  onBack,
}: OfflineQuizProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = questions[currentQuestion];

  const handleNext = () => {
    if (selectedAnswer === null) return;

    if (selectedAnswer === question.answer) {
      setScore((previous) => previous + 1);
    }

    if (currentQuestion === questions.length - 1) {
      setFinished(true);
      return;
    }

    setCurrentQuestion((previous) => previous + 1);
    setSelectedAnswer(null);
  };

  if (finished) {
    const finalScore =
      score + (selectedAnswer === question.answer ? 1 : 0);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>

          <Text style={styles.resultIcon}>✓</Text>

          <Text style={styles.resultTitle}>
            Quiz Completed
          </Text>

          <Text style={styles.resultSubtitle}>
            Your result was saved locally.
          </Text>

          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>
              Your Score
            </Text>

            <Text style={styles.score}>
              {finalScore}/{questions.length}
            </Text>

            <Text style={styles.offlineLabel}>
              ● Saved Offline
            </Text>
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={onBack}
          >
            <Text style={styles.primaryButtonText}>
              Back to Dashboard
            </Text>
          </Pressable>

        </View>
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

        <View>
          <Text style={styles.headerTitle}>
            Take Quiz
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
          {question.question}
        </Text>

        <View style={styles.options}>
          {question.options.map((option, index) => {
            const selected =
              selectedAnswer === index;

            return (
              <Pressable
                key={option}
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
