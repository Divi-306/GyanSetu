import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, C, Card, Header, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { errorMessage } from '@/lib/api';
import { buildOfflineQuiz, listPackQuizzes, saveQuizToPack, type SavedQuiz } from '@/services/learningPacks';
import { selectOnline, useApp } from '@/stores/appStore';

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function PackQuizzes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useApp(selectOnline);
  const { data: quizzes } = useLocalData(() => listPackQuizzes(id), id);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takeOfflineQuiz = async () => {
    setBuilding(true);
    setError(null);
    try {
      const quiz = await buildOfflineQuiz(id, { count: 10 });
      if (quiz.questions.length === 0) {
        setError('No quiz questions are saved on this phone yet for this pack. Study a few topics first, or generate a quiz while online.');
        return;
      }
      const quizId = await saveQuizToPack(id, quiz, 'offline');
      router.push(`/packs/${id}/quiz/${quizId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Header title="Quizzes" subtitle="Test yourself on this pack" back={`/packs/${id}`} />
      <ScrollView contentContainerStyle={ui.content}>
        {error ? <Text style={ui.error}>{error}</Text> : null}

        <Card>
          <Text style={ui.body}>Take a quiz right now using questions already saved on this phone — no internet needed.</Text>
          <Button label="Take Quiz Offline" onPress={takeOfflineQuiz} busy={building} style={s.mt} />
        </Card>

        <Card>
          <Text style={ui.body}>Online, the AI can write a fresh quiz for any topics in this pack, at the difficulty and length you choose.</Text>
          <Button
            label="Generate New Quiz"
            kind="secondary"
            onPress={() => router.push(`/packs/${id}/quiz/new`)}
            disabled={!online}
            style={s.mt}
          />
          {!online ? <Text style={[ui.muted, s.mt6]}>Connect to the internet to generate a new quiz.</Text> : null}
        </Card>

        {quizzes?.length ? (
          <>
            <Text style={ui.sectionTitle}>Saved quizzes</Text>
            {quizzes.map((q: SavedQuiz) => (
              <Card key={q.id} style={s.quizCard}>
                <Text style={s.quizSubject}>{q.subject}</Text>
                <Text style={ui.muted}>
                  {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty} · {q.questionCount} questions · {q.source === 'offline' ? 'Built offline' : 'Generated online'}
                </Text>
                <Button label="Take Quiz" kind="ghost" onPress={() => router.push(`/packs/${id}/quiz/${q.id}`)} style={s.mt6} />
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  mt: { marginTop: 12 },
  mt6: { marginTop: 6 },
  quizCard: { gap: 2 },
  quizSubject: { fontSize: 15, fontWeight: '700', color: C.text },
});
