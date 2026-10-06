import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { db } from '@/db';
import { useLocalData } from '@/hooks/useLocalData';
import { usePublishScreen } from '@/navigator/store';
import { goBackOr } from '@/lib/nav';
import { listQuizzes } from '@/services/learning';

async function loadQuizzes() {
  const quizzes = await listQuizzes();
  const best = await db.getAllAsync<{ quiz_id: string; best: number; total: number }>(
    'SELECT quiz_id, max(score) AS best, total FROM quiz_attempts GROUP BY quiz_id',
  );
  const bestById = new Map(best.map((b) => [b.quiz_id, b]));
  return quizzes.map((q) => ({ ...q, best: bestById.get(q.id) ?? null }));
}

/** Every quiz available on this phone (Starter Bundle demos + downloaded courses). */
export default function Quizzes() {
  const { t } = useTranslation();
  const { data: quizzes } = useLocalData(loadQuizzes);
  const screenItems = useMemo(() => (quizzes ?? []).map((q) => ({ title: q.title, href: `/quiz/${q.id}` as const })), [quizzes]);
  usePublishScreen(screenItems);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => goBackOr('/dashboard')}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>{t('quiz.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('quiz.practiceOffline')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {quizzes?.length === 0 && (
          <Text style={styles.empty}>{t('quiz.empty')}</Text>
        )}
        {quizzes?.map((q) => (
          <Pressable key={q.id} style={styles.card} onPress={() => router.push(`/quiz/${q.id}`)}>
            <View style={styles.icon}>
              <Text style={styles.iconText}>{q.icon ?? '📝'}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{q.title}</Text>
              <Text style={styles.cardMeta}>
                {q.courseTitle} • {t('quiz.questionCount', { count: q.questionCount })}
                {q.best ? ` • ${t('quiz.bestScore', { score: q.best.best, total: q.best.total })}` : ''}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6F0' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center',
    justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#E8E3D9',
  },
  backText: { fontSize: 26, lineHeight: 28, color: '#315C43' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#173C31' },
  headerSubtitle: { fontSize: 12, color: '#6A746C', marginTop: 2 },
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  empty: { fontSize: 13, lineHeight: 20, color: '#6A746C', marginTop: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E8E3D9', marginBottom: 10,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EAF2E7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#29392C' },
  cardMeta: { fontSize: 11, color: '#7A817A', marginTop: 3 },
  arrow: { fontSize: 24, color: '#829083' },
});
