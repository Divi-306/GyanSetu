import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, C, Card, Header, ProgressBar, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { getQuiz, recordQuizAttempt, type QuizAttemptResult } from '@/services/learningPacks';
import { selectOnline, useApp } from '@/stores/appStore';

export default function PackQuizTake() {
  const { id, quizId } = useLocalSearchParams<{ id: string; quizId: string }>();
  const online = useApp(selectOnline);
  const { data: quiz } = useLocalData(() => getQuiz(id, quizId), `${id}:${quizId}`);

  const startedAt = useRef(new Date().toISOString());
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number }[]>([]);
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (quiz === undefined) return <View style={ui.screen} />;
  if (quiz === null || quiz.questions.length === 0) {
    return (
      <View style={ui.screen}>
        <Header title="Quiz" back={`/packs/${id}/quiz`} />
        <View style={ui.content}>
          <Text style={ui.muted}>This quiz isn&apos;t available.</Text>
        </View>
      </View>
    );
  }

  const questions = quiz.questions;
  const question = questions[current];

  const next = async () => {
    if (selected === null) return;
    const updated = [...answers, { questionId: question.id, selectedIndex: selected }];
    setAnswers(updated);
    if (current === questions.length - 1) {
      setSubmitting(true);
      setResult(await recordQuizAttempt(id, quizId, updated, startedAt.current));
      setSubmitting(false);
      return;
    }
    setCurrent((n) => n + 1);
    setSelected(null);
  };

  if (result) {
    return (
      <View style={ui.screen}>
        <Header title="Quiz Result" back={`/packs/${id}/quiz`} />
        <ScrollView contentContainerStyle={ui.content}>
          <Card style={s.scoreCard}>
            <Text style={s.scoreBig}>{result.score}/{result.total}</Text>
            <Text style={ui.muted}>{online ? 'Saved — will sync to your account.' : 'Saved on this phone.'}</Text>
            {result.weakTopicIds.length ? <Text style={[ui.body, s.mt6]}>⚠️ Weak on {result.weakTopicIds.length} topic{result.weakTopicIds.length === 1 ? '' : 's'} this attempt — the AI Tutor can help.</Text> : null}
          </Card>

          <Text style={ui.sectionTitle}>Review</Text>
          {questions.map((q, i) => {
            const picked = answers[i]?.selectedIndex;
            const right = picked === q.correctIndex;
            return (
              <Card key={q.id}>
                <Text style={s.reviewQuestion}>{i + 1}. {q.question}</Text>
                <Text style={[s.reviewAnswer, { color: right ? C.green : C.red }]}>
                  {right ? '✓ ' : '✗ '}{q.options[picked ?? 0]}
                </Text>
                {!right ? <Text style={[ui.body, s.mt6]}>Correct: {q.options[q.correctIndex]}</Text> : null}
                {q.explanation ? <Text style={[ui.muted, s.mt6]}>{q.explanation}</Text> : null}
              </Card>
            );
          })}

          <Button label="Back to pack" onPress={() => router.replace(`/packs/${id}`)} style={s.mt} />
        </ScrollView>
      </View>
    );
  }

  const progress = (current + 1) / questions.length;

  return (
    <View style={ui.screen}>
      <Header title={quiz.subject} subtitle={`Question ${current + 1} of ${questions.length}`} back={`/packs/${id}/quiz`} />
      <View style={ui.content}>
        <ProgressBar value={progress} height={8} />

        <Card style={s.mt}>
          <Text style={s.question}>{question.question}</Text>
          <View style={s.options}>
            {question.options.map((opt, i) => (
              <Pressable key={i} style={[s.option, selected === i && s.optionActive]} onPress={() => setSelected(i)}>
                <Text style={[s.optionText, selected === i && s.optionTextActive]}>{opt}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Button
          label={current === questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
          onPress={next}
          disabled={selected === null}
          busy={submitting}
          style={s.mt}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  mt: { marginTop: 14 },
  mt6: { marginTop: 6 },
  question: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 16, lineHeight: 25 },
  options: { gap: 10 },
  option: { minHeight: 50, borderRadius: 12, borderWidth: 1.5, borderColor: C.softBorder, paddingHorizontal: 14, justifyContent: 'center' },
  optionActive: { backgroundColor: C.soft, borderColor: C.primary },
  optionText: { fontSize: 14, color: C.body },
  optionTextActive: { color: C.primaryDark, fontWeight: '600' },
  scoreCard: { alignItems: 'center', paddingVertical: 20 },
  scoreBig: { fontSize: 38, fontWeight: '800', color: C.primaryDark },
  reviewQuestion: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 },
  reviewAnswer: { fontSize: 13, fontWeight: '600' },
});
