import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, C, Card, Header, styles as ui } from '@/components/packs/ui';
import { errorMessage } from '@/lib/api';
import { generateQuiz, saveQuizToPack, type GeneratedQuiz } from '@/services/learningPacks';

const DIFFICULTIES: { key: 'easy' | 'medium' | 'hard'; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];
const COUNTS: (5 | 10 | 20)[] = [5, 10, 20];

export default function PackQuizNew() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState<5 | 10 | 20>(10);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setQuiz(null);
    try {
      setQuiz(await generateQuiz(id, { difficulty, count }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const saveAndTake = async () => {
    if (!quiz) return;
    setSaving(true);
    setError(null);
    try {
      const quizId = await saveQuizToPack(id, quiz, 'online');
      router.replace(`/packs/${id}/quiz/${quizId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Header title="Generate Quiz" subtitle="Any difficulty, any length" back={`/packs/${id}/quiz`} />
      <ScrollView contentContainerStyle={ui.content}>
        {error ? <Text style={ui.error}>{error}</Text> : null}

        <Card>
          <Text style={ui.sectionTitle}>Difficulty</Text>
          <View style={s.row}>
            {DIFFICULTIES.map((d) => (
              <Pressable key={d.key} style={[s.chip, difficulty === d.key && s.chipActive]} onPress={() => setDifficulty(d.key)}>
                <Text style={[s.chipText, difficulty === d.key && s.chipTextActive]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[ui.sectionTitle, s.mt]}>Questions</Text>
          <View style={s.row}>
            {COUNTS.map((n) => (
              <Pressable key={n} style={[s.chip, count === n && s.chipActive]} onPress={() => setCount(n)}>
                <Text style={[s.chipText, count === n && s.chipTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Button label="Generate" onPress={generate} busy={generating} style={s.mt} />
        </Card>

        {quiz ? (
          <Card>
            <Text style={ui.sectionTitle}>{quiz.subject}</Text>
            <Text style={ui.body}>
              {quiz.questions.length} questions · {DIFFICULTIES.find((d) => d.key === quiz.difficulty)?.label ?? quiz.difficulty} difficulty
            </Text>
            <Text style={[ui.muted, s.mt6]}>Covers {quiz.topicIds.length} topic{quiz.topicIds.length === 1 ? '' : 's'} from this pack.</Text>
            <Button label="Save to Learning Pack & Take Quiz" onPress={saveAndTake} busy={saving} style={s.mt} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mt: { marginTop: 14 },
  mt6: { marginTop: 6 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.softBorder, backgroundColor: C.card },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: C.body },
  chipTextActive: { color: '#fff' },
});
