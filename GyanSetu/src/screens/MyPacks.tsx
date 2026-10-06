import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, C, Header, ProgressBar, levelLabel, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { timeAgo } from '@/lib/format';
import { usePublishScreen } from '@/navigator/store';
import { listMyPacks, usePackDownloads, type MyPack } from '@/services/learningPacks';
import { selectOnline, useApp } from '@/stores/appStore';

export default function MyPacks() {
  const online = useApp(selectOnline);
  const downloading = usePackDownloads((s) => s.active);
  const { data } = useLocalData(listMyPacks);

  // Offline, only packs actually on the phone and pinned for offline can be opened.
  const packs = useMemo(() => (data ?? []).filter((p) => online || (p.onDevice && p.offline)), [data, online]);
  const hiddenOffline = (data?.length ?? 0) - packs.length;

  const screenItems = useMemo(() => packs.map((p) => ({ title: p.title, href: `/packs/${p.packId}` as const })), [packs]);
  usePublishScreen(screenItems);

  const open = (p: MyPack) => router.push(p.onDevice ? `/packs/${p.packId}` : `/packs/preview/${p.packId}`);

  return (
    <View style={ui.screen}>
      <Header title="My Learning Packs" subtitle={online ? 'Learn anything, anywhere' : 'Showing packs available offline'} />
      <ScrollView contentContainerStyle={ui.content}>
        {data !== undefined && packs.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📚</Text>
            <Text style={s.emptyTitle}>{online ? 'No learning packs yet' : 'No packs available offline'}</Text>
            <Text style={[ui.muted, s.center]}>
              {online
                ? 'Type any subject — "Computer Networks", "React", "Calculus" — and download its pack to learn offline.'
                : 'Connect to the internet to create a pack, then tap Download to keep it on this phone.'}
            </Text>
            {online ? <Button label="Learn something new" onPress={() => router.push('/learn')} style={s.emptyBtn} /> : null}
          </View>
        ) : null}

        {packs.map((p) => {
          const update = p.onDevice && p.latestVersion != null && p.latestVersion > p.version;
          const dl = downloading[p.packId];
          return (
            <Pressable key={p.packId} style={s.card} onPress={() => open(p)}>
              <View style={s.row}>
                <Text style={s.icon}>{p.icon}</Text>
                <View style={s.flex}>
                  <Text style={s.title} numberOfLines={2}>{p.title}</Text>
                  <Text style={ui.muted}>
                    {p.moduleCount ? `${p.moduleCount} Modules · ` : ''}
                    {levelLabel(p.levelFrom, p.levelTo)}
                  </Text>
                </View>
              </View>

              <View style={s.progressRow}>
                <View style={s.flex}>
                  <ProgressBar value={p.percent / 100} />
                </View>
                <Text style={s.percent}>{p.percent}%</Text>
              </View>

              <View style={s.badges}>
                {dl ? (
                  <Badge label={`Downloading ${Math.round(dl.progress * 100)}%`} tone="amber" />
                ) : p.onDevice && p.offline ? (
                  <Badge label="✓ Offline Available" />
                ) : p.onDevice ? (
                  <Badge label="Online only" tone="grey" />
                ) : (
                  <Badge label="☁ Not on this phone" tone="grey" />
                )}
                {update ? <Badge label="↻ Update available" tone="amber" /> : null}
                {p.weakCount ? <Badge label={`⚠ ${p.weakCount} weak topic${p.weakCount === 1 ? '' : 's'}`} tone="red" /> : null}
                {p.lastStudiedAt ? <Text style={s.when}>Studied {timeAgo(p.lastStudiedAt)}</Text> : null}
              </View>
            </Pressable>
          );
        })}

        {!online && hiddenOffline > 0 ? (
          <Text style={[ui.muted, s.center]}>
            {hiddenOffline} more pack{hiddenOffline === 1 ? ' is' : 's are'} in your library but not downloaded to this phone.
          </Text>
        ) : null}

        {online && packs.length > 0 ? <Button label="+ Learn something new" kind="secondary" onPress={() => router.push('/learn')} style={s.newBtn} /> : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#ECEFE8' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { fontSize: 36 },
  flex: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 3 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  percent: { fontSize: 13, fontWeight: '700', color: C.primaryDark, width: 40, textAlign: 'right' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 },
  when: { fontSize: 11, color: C.muted, marginLeft: 'auto' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 46 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginVertical: 8 },
  emptyBtn: { marginTop: 18, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  newBtn: { marginTop: 8 },
});
