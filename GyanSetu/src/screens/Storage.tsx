import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, C, Card, Header, ProgressBar, styles as ui } from '@/components/packs/ui';
import { StorageNotices } from '@/components/packs/StorageNotices';
import { useLocalData } from '@/hooks/useLocalData';
import { formatBytes, timeAgo } from '@/lib/format';
import { deletePack } from '@/services/learningPacks';
import { clearCachedVideos, devSimulateUnused, exportPackProgress, optimizePack, storageSummary } from '@/services/storage';

export default function Storage() {
  const { data } = useLocalData(storageSummary);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!data) return <View style={ui.screen} />;
  const used = data.totalBytes;

  const compressUnused = async () => {
    setBusy('compress');
    let saved = 0;
    for (const p of data.packs.filter((x) => !x.optimized && x.daysUnused >= 7)) saved += await optimizePack(p.packId).catch(() => 0);
    setBusy(null);
    setMessage(saved > 0 ? `Saved ${formatBytes(saved)}. Your lessons, quizzes and progress are untouched.` : 'Nothing to compress — packs unused for 7+ days are already optimised.');
  };

  const clearVideos = () =>
    Alert.alert('Clear downloaded videos?', 'Videos you saved from packs will be removed from this phone. You can download them again when online. Your own videos are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setBusy('videos');
          const freed = await clearCachedVideos();
          setBusy(null);
          setMessage(`Freed ${formatBytes(freed)}.`);
        },
      },
    ]);

  const simulate = async (packId: string, title: string, daysAgo: number) => {
    setBusy(`sim-${packId}`);
    const notices = await devSimulateUnused(packId, daysAgo);
    setBusy(null);
    const mine = notices.filter((n) => n.packId === packId);
    setMessage(
      mine.length
        ? mine.map((n) => (n.kind === 'optimized' ? `${title}: optimised, saved ${formatBytes(n.bytesSaved)}.` : `${title}: unused ${n.days} days — delete warning raised.`)).join(' ')
        : `${title}: simulated ${daysAgo} day${daysAgo === 1 ? '' : 's'} unused — not yet eligible for compression or a delete warning.`,
    );
  };

  const remove = (packId: string, title: string, ownVideos: number) =>
    Alert.alert(
      `Delete ${title}?`,
      `It will be removed from this phone and your library.${ownVideos ? ` ${ownVideos} video${ownVideos === 1 ? '' : 's'} you added will be deleted too.` : ''} Your progress is kept and comes back if you download it again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export progress first', onPress: async () => void Share.share({ title, message: await exportPackProgress(packId) }) },
        { text: 'Delete', style: 'destructive', onPress: () => void deletePack(packId) },
      ],
    );

  const rows = [
    { label: 'Learning packs', bytes: data.learningPackBytes },
    { label: 'Videos', bytes: data.videoBytes },
    { label: 'Compressed data', bytes: data.compressedBytes },
    { label: 'Other offline data', bytes: data.otherBytes },
  ];

  return (
    <View style={ui.screen}>
      <Header title="Offline Storage" subtitle="What GyanSetu keeps on this phone" />
      <ScrollView contentContainerStyle={ui.content}>
        <StorageNotices />

        <Card>
          <Text style={s.total}>{formatBytes(used)} used</Text>
          {/* Share of the space GyanSetu could use: what it uses + what is still free. */}
          <ProgressBar value={used / Math.max(1, used + data.deviceFreeBytes)} height={10} />
          <Text style={[ui.muted, s.mt6]}>{formatBytes(data.deviceFreeBytes)} free on this phone</Text>
          <View style={s.rows}>
            {rows.map((r) => (
              <View key={r.label} style={s.row}>
                <Text style={ui.body}>{r.label}</Text>
                <Text style={s.bytes}>{formatBytes(r.bytes)}</Text>
              </View>
            ))}
          </View>
        </Card>

        {message ? <Text style={[ui.body, s.message]}>{message}</Text> : null}
        <View style={s.actions}>
          <Button label="Compress unused packs" kind="secondary" onPress={compressUnused} busy={busy === 'compress'} disabled={!!busy} />
          <Button label="Clear cached videos" kind="secondary" onPress={clearVideos} busy={busy === 'videos'} disabled={!!busy || data.videoBytes === 0} />
          <Button label="Manage learning packs" kind="ghost" onPress={() => router.push('/packs')} />
        </View>

        <Text style={ui.sectionTitle}>Learning packs</Text>
        {data.packs.length === 0 ? <Text style={ui.muted}>No learning packs on this phone yet.</Text> : null}
        {data.packs.map((p) => (
          <Card key={p.packId}>
            <Pressable style={s.packRow} onPress={() => router.push(`/packs/${p.packId}`)}>
              <Text style={s.icon}>{p.icon}</Text>
              <View style={s.flex}>
                <Text style={s.title}>{p.title}</Text>
                <Text style={ui.muted}>
                  {formatBytes(p.totalBytes)} · last used {timeAgo(p.lastUsedAt)}
                </Text>
                <Text style={ui.muted}>
                  Videos: {p.videosDownloaded}/{p.videosTotal}
                  {p.videoBytes ? ` (${formatBytes(p.videoBytes)})` : ''}
                </Text>
              </View>
              <View style={s.badges}>
                {p.optimized ? <Badge label="Optimized" tone="amber" /> : p.offline ? <Badge label="Offline" /> : <Badge label="Cached" tone="grey" />}
              </View>
            </Pressable>
            <Button label="Delete" kind="danger" onPress={() => remove(p.packId, p.title, p.ownVideos)} style={s.delete} />
            {__DEV__ ? (
              <View style={s.devPanel}>
                <Text style={s.devLabel}>DEV: simulate unused for</Text>
                <View style={s.devRow}>
                  {[1, 7, 30].map((d) => (
                    <Button
                      key={d}
                      label={`${d}d ago`}
                      kind="ghost"
                      onPress={() => simulate(p.packId, p.title, d)}
                      busy={busy === `sim-${p.packId}`}
                      disabled={!!busy}
                      style={s.devButton}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </Card>
        ))}
        <Text style={[ui.muted, s.footer]}>
          Compressing keeps every lesson, quiz, flashcard and your progress. It zips the pack’s backup copy and removes videos you can download again. Nothing is deleted without asking you.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  total: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 10 },
  mt6: { marginTop: 6 },
  rows: { marginTop: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  bytes: { fontSize: 14, fontWeight: '700', color: C.primaryDark },
  message: { marginBottom: 10 },
  actions: { gap: 8, marginBottom: 6 },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 30 },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  badges: { alignItems: 'flex-end' },
  delete: { minHeight: 38, marginTop: 10 },
  footer: { marginTop: 8 },
  devPanel: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEF0EC', paddingTop: 10 },
  devLabel: { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 6 },
  devRow: { flexDirection: 'row', gap: 6 },
  devButton: { minHeight: 36, paddingHorizontal: 10, flex: 1 },
});
