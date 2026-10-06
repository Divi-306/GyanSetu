import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { StorageNotices } from '@/components/packs/StorageNotices';
import { ProgressBar } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { greeting } from '@/lib/dates';
import { formatBytes } from '@/lib/format';
import { getProgressOverview } from '@/services/analytics';
import { cachedCareer } from '@/services/career';
import { getContinueLearning } from '@/services/learning';
import { listMyPacks } from '@/services/learningPacks';
import { inactivityNudge } from '@/services/reminders';
import { storageSummary } from '@/services/storage';
import { selectOnline, useApp } from '@/stores/appStore';
import { formatDuration } from '@/tutor/progress';

/** Everything on the home screen, read locally: the dashboard works fully offline. */
async function loadDashboard() {
  const [overview, packs, course, career, nudge, storage] = await Promise.all([
    getProgressOverview(),
    listMyPacks(),
    getContinueLearning(),
    cachedCareer(),
    inactivityNudge(),
    storageSummary(),
  ]);
  return { overview, packs, course, career, nudge, storage };
}

export default function Dashboard() {
  const user = useApp((s) => s.user);
  const isGuest = useApp((s) => s.sessionStatus !== 'authed');
  const online = useApp(selectOnline);
  const pending = useApp((s) => s.pendingSyncCount);
  const syncing = useApp((s) => s.syncing);
  const { data } = useLocalData(loadDashboard);

  const name = user?.name?.trim() ? user.name.split(' ')[0] : null;
  const statusText = syncing
    ? 'Saving your progress…'
    : pending > 0
      ? isGuest
        ? `${pending} change${pending === 1 ? '' : 's'} saved on this device. Log in to back them up.`
        : `${pending} change${pending === 1 ? '' : 's'} will sync when you're online.`
      : online
        ? isGuest
          ? 'Log in to back up your progress.'
          : 'Your progress is backed up.'
        : 'Your learning continues without internet.';

  const current = data?.overview.current ?? null;
  const course = data?.course ?? null;
  const streak = data?.overview.streaks;
  const topPath = data?.career?.guidance?.paths[0] ?? null;
  const recommended = [
    ...(topPath?.nextPacks ?? []).map((p) => ({ label: `${p.subject} — ${p.durationDays} days`, go: () => router.push({ pathname: '/learn', params: { subject: p.subject, days: String(p.durationDays), goal: p.goal } }) })),
    ...(data?.overview.weak ?? []).slice(0, 2).map((w) => ({ label: `Practise ${w.title}`, go: () => router.push({ pathname: '/packs/[id]/tutor', params: { id: w.packId, q: `Quiz me on ${w.title}` } }) })),
  ].slice(0, 4);

  const continueLearning = () => {
    if (current) router.push(current.topicId ? `/packs/${current.packId}/topic/${current.topicId}` : `/packs/${current.packId}`);
    else if (course?.lastLessonId) router.push(`/lesson/${course.lastLessonId}`);
    else if (course) router.push(`/course/${course.courseId}`);
    else router.push('/learn');
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>{name ? `${greeting()}, ${name}` : `${greeting()} 👋`}</Text>
            <Text style={styles.subtitle}>What will you learn today?</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')} accessibilityLabel="Profile">
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
        </View>

        {/* Online / offline */}
        <TouchableOpacity style={styles.status} onPress={() => router.push('/offline')} activeOpacity={0.85}>
          <Text style={styles.statusTitle}>{online ? '🟢 Online' : '🔴 Offline'}</Text>
          <Text style={styles.statusText}>{statusText}</Text>
        </TouchableOpacity>

        <StorageNotices />

        {data?.nudge ? (
          <Pressable style={styles.nudge} onPress={() => router.push(data.nudge!.url as never)}>
            <Text style={styles.nudgeTitle}>{data.nudge.title}</Text>
            <Text style={styles.nudgeText}>{data.nudge.body}</Text>
            <Text style={styles.link}>Continue learning →</Text>
          </Pressable>
        ) : streak?.missedYesterday ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>That’s okay. Let’s continue from where you left off.</Text>
          </View>
        ) : null}

        {/* Continue Learning */}
        <Text style={styles.sectionTitle}>Continue Learning</Text>
        <Pressable style={styles.card} onPress={continueLearning}>
          <Text style={styles.cardTitle}>
            {current ? `${current.icon} ${current.title}` : course ? `${course.icon ?? '📚'} ${course.title}` : '✨ Learn anything'}
          </Text>
          <Text style={styles.muted}>
            {current
              ? current.durationDays && current.dayNumber
                ? `Day ${current.dayNumber} / ${current.durationDays}${current.topicTitle ? ` · ${current.topicTitle}` : ''}`
                : current.topicTitle ?? 'Continue where you left off'
              : course
                ? course.lastLessonTitle ?? 'Continue where you left off'
                : 'Type any subject and choose how many days'}
          </Text>
          {current || course ? (
            <View style={styles.progressRow}>
              <View style={styles.flex}>
                <ProgressBar value={(current?.percent ?? course?.percent ?? 0) / 100} />
              </View>
              <Text style={styles.percent}>{current?.percent ?? course?.percent ?? 0}%</Text>
            </View>
          ) : null}
          <View style={styles.button}>
            <Text style={styles.buttonText}>{current || course ? 'Continue' : 'Start'}</Text>
          </View>
        </Pressable>

        {/* Progress */}
        <Pressable style={styles.card} onPress={() => router.push('/progress')}>
          <Text style={styles.cardTitle}>Your Progress</Text>
          <View style={styles.statsRow}>
            <Stat value={`${data?.overview.overallPercent ?? 0}%`} label="Overall" />
            <Stat value={`🔥 ${streak?.current ?? 0}`} label={`day streak`} />
            <Stat value={formatDuration(data?.overview.studySeconds ?? 0)} label="studied" />
          </View>
          <Text style={styles.link}>View progress →</Text>
        </Pressable>

        {/* Recommended */}
        {recommended.length ? (
          <>
            <Text style={styles.sectionTitle}>Recommended for you</Text>
            <View style={styles.card}>
              {recommended.map((r) => (
                <Pressable key={r.label} onPress={r.go} style={styles.recRow}>
                  <Text style={styles.recText}>→ {r.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {/* Career */}
        <Pressable style={styles.card} onPress={() => router.push('/career')}>
          <Text style={styles.cardTitle}>💼 Career Guidance</Text>
          <Text style={styles.muted}>
            {topPath ? `Recommended path: ${topPath.title} · Match ${topPath.match}%` : 'See where your learning can lead, with a step-by-step roadmap.'}
          </Text>
          <Text style={styles.link}>{topPath ? 'View career roadmap →' : 'Open →'}</Text>
        </Pressable>

        {/* Learning packs */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Learning Packs</Text>
          <Pressable onPress={() => router.push('/packs')}>
            <Text style={styles.link}>See all</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packs}>
          <Pressable style={[styles.pack, styles.newPack]} onPress={() => router.push('/learn')}>
            <Text style={styles.packIcon}>✨</Text>
            <Text style={styles.packTitle}>Learn anything</Text>
            <Text style={styles.muted}>{online ? 'New pack' : 'Needs internet'}</Text>
          </Pressable>
          {(data?.packs ?? []).filter((p) => online || (p.onDevice && p.offline)).slice(0, 8).map((p) => (
            <Pressable key={p.packId} style={styles.pack} onPress={() => router.push(p.onDevice ? `/packs/${p.packId}` : `/packs/preview/${p.packId}`)}>
              <Text style={styles.packIcon}>{p.icon}</Text>
              <Text style={styles.packTitle} numberOfLines={2}>{p.title}</Text>
              <Text style={styles.muted}>{p.percent}%{p.offline ? ' · offline' : ''}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Storage */}
        <Pressable style={styles.card} onPress={() => router.push('/storage')}>
          <Text style={styles.cardTitle}>Storage</Text>
          <Text style={styles.muted}>
            {formatBytes(data?.storage.totalBytes ?? 0)} used · {formatBytes(data?.storage.deviceFreeBytes ?? 0)} free
          </Text>
          <View style={styles.storageBar}>
            <ProgressBar value={(data?.storage.totalBytes ?? 0) / Math.max(1, (data?.storage.totalBytes ?? 0) + (data?.storage.deviceFreeBytes ?? 1))} />
          </View>
          <Text style={styles.link}>Manage storage →</Text>
        </Pressable>

        {/* Quick actions (existing features) */}
        <Text style={styles.sectionTitle}>More</Text>
        <View style={styles.quick}>
          <Quick icon="🤖" label="Ask AI" onPress={() => router.push('/ai')} />
          <Quick icon="📝" label="Quizzes" onPress={() => router.push('/quizzes')} />
          <Quick icon="🎓" label="Scholarships" onPress={() => router.push('/scholarships')} />
          <Quick icon="📖" label="Classic courses" onPress={() => router.push('/courses')} />
        </View>

        {isGuest ? (
          <TouchableOpacity style={styles.login} onPress={() => router.push('/login')}>
            <Text style={styles.loginText}>Log in or create an account</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function Quick({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickCard} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF8' },
  content: { padding: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#20352A', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#7A847D' },
  profileButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E8F0E4', alignItems: 'center', justifyContent: 'center' },
  profileIcon: { fontSize: 21 },
  status: { backgroundColor: '#F1F6ED', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#DCE7D6' },
  statusTitle: { fontSize: 14, fontWeight: '700', color: '#20352A', marginBottom: 2 },
  statusText: { fontSize: 12, color: '#66756A' },
  nudge: { backgroundColor: '#FFF8E8', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F1E2BC' },
  nudgeTitle: { fontSize: 15, fontWeight: '700', color: '#5C4210', marginBottom: 4 },
  nudgeText: { fontSize: 14, lineHeight: 20, color: '#4A564C' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#20352A', marginTop: 6, marginBottom: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E7ECE3', marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#20352A', marginBottom: 4 },
  muted: { fontSize: 12, color: '#7A847D', lineHeight: 18 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  percent: { fontSize: 13, fontWeight: '700', color: '#315C43', width: 40, textAlign: 'right' },
  button: { marginTop: 12, backgroundColor: '#5F8068', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#20352A' },
  link: { color: '#5F8068', fontWeight: '700', fontSize: 13, marginTop: 6 },
  recRow: { paddingVertical: 8 },
  recText: { fontSize: 14, color: '#315C43', fontWeight: '600' },
  packs: { gap: 10, paddingBottom: 14 },
  pack: { width: 130, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E7ECE3' },
  newPack: { backgroundColor: '#F1F6ED', borderColor: '#DCE7D6' },
  packIcon: { fontSize: 26, marginBottom: 6 },
  packTitle: { fontSize: 14, fontWeight: '700', color: '#20352A', marginBottom: 4 },
  storageBar: { marginTop: 10 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  quickCard: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E7ECE3', alignItems: 'center' },
  quickIcon: { fontSize: 22, marginBottom: 4 },
  quickLabel: { fontSize: 13, fontWeight: '600', color: '#20352A' },
  login: { borderWidth: 1.5, borderColor: '#5F8068', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  loginText: { color: '#4F765C', fontWeight: '700', fontSize: 15 },
});
