import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, C, Header, ProgressBar, StatBar, WeekBars, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { getProgressOverview } from '@/services/analytics';
import { formatDuration } from '@/tutor/progress';

/** Learning progress across all packs. Everything here is computed on the phone, so it works offline. */
export default function Progress() {
  const { data } = useLocalData(getProgressOverview);
  if (!data) return <View style={ui.screen} />;
  const { streaks, current } = data;

  return (
    <View style={ui.screen}>
      <Header title="Learning Progress" subtitle="Works offline · syncs when you're online" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card>
          <Text style={s.label}>Overall progress</Text>
          <View style={s.overallRow}>
            <View style={s.flex}>
              <ProgressBar value={data.overallPercent / 100} height={12} />
            </View>
            <Text style={s.big}>{data.overallPercent}%</Text>
          </View>
          <Text style={ui.muted}>
            {data.topicsCompleted} topics completed · {data.topicsRemaining} remaining
          </Text>
        </Card>

        {current ? (
          <Pressable onPress={() => router.push(current.topicId ? `/packs/${current.packId}/topic/${current.topicId}` : `/packs/${current.packId}`)}>
            <Card>
              <Text style={s.label}>Current learning</Text>
              <Text style={s.title}>
                {current.icon} {current.title}
              </Text>
              <Text style={ui.muted}>
                {current.durationDays && current.dayNumber ? `Day ${current.dayNumber} / ${current.durationDays} · ` : ''}
                {current.percent}% done{current.topicTitle ? ` · next: ${current.topicTitle}` : ''}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        <Card>
          <View style={s.streakRow}>
            <Text style={s.streak}>🔥 {streaks.current} day streak</Text>
            <Text style={ui.muted}>Longest: {streaks.longest}</Text>
          </View>
          {streaks.missedYesterday ? (
            <Text style={[ui.body, s.kind]}>That’s okay. Let’s continue from where you left off.</Text>
          ) : null}
          <Text style={[s.label, s.mt]}>This week</Text>
          <WeekBars week={data.week} />
        </Card>

        <View style={s.tiles}>
          <Tile label="Study time" value={formatDuration(data.studySeconds)} />
          <Tile label="Quiz accuracy" value={data.accuracy == null ? '—' : `${Math.round(data.accuracy * 100)}%`} />
          <Tile label="Questions answered" value={String(data.answers)} />
          <Tile label="Study days" value={String(streaks.studyDays)} />
        </View>

        {data.packs.length ? (
          <Card>
            <Text style={s.label}>By learning pack</Text>
            {data.packs.map((p) => (
              <Pressable key={p.packId} onPress={() => router.push(`/packs/${p.packId}`)}>
                <StatBar label={`${p.icon} ${p.title}`} value={p.percent} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        <Card>
          <Text style={s.label}>Strong areas</Text>
          {data.strong.length ? (
            data.strong.map((t) => (
              <Text key={t.packTitle + t.title} style={[ui.body, s.item]}>✓ {t.title} <Text style={ui.muted}>· {t.packTitle}</Text></Text>
            ))
          ) : (
            <Text style={ui.muted}>Answer a few quizzes and your strengths will show up here.</Text>
          )}
          <Text style={[s.label, s.mt]}>Needs improvement</Text>
          {data.weak.length ? (
            data.weak.map((t) => (
              <Pressable key={t.packId + t.topicId} onPress={() => router.push({ pathname: '/packs/[id]/tutor', params: { id: t.packId, q: `Quiz me on ${t.title}` } })}>
                <Text style={[ui.body, s.item]}>
                  ⚠ {t.title} <Text style={ui.muted}>· {Math.round(t.accuracy * 100)}% · tap to practise</Text>
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={ui.muted}>No weak topics so far.</Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '800', color: C.primaryDark, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  overallRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  flex: { flex: 1 },
  big: { fontSize: 22, fontWeight: '800', color: C.text },
  title: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 2 },
  streakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streak: { fontSize: 18, fontWeight: '800', color: C.text },
  kind: { marginTop: 8 },
  mt: { marginTop: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#ECEFE8' },
  tileValue: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 2 },
  item: { marginBottom: 6 },
});
