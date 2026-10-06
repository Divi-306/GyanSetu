import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DownloadModal } from '@/components/packs/DownloadModal';
import { Badge, Button, C, Card, Header, ProgressBar, levelLabel, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { errorMessage } from '@/lib/api';
import { formatBytes, timeAgo } from '@/lib/format';
import { usePublishScreen } from '@/navigator/store';
import {
  PackDownloadError,
  deletePack,
  downloadPack,
  getInsights,
  getPackDetail,
  listTopicVideos,
  makeAvailableOffline,
  usePackDownloads,
  type Insights,
} from '@/services/learningPacks';
import { exportPackProgress, optimizePack, restorePack } from '@/services/storage';
import { downloadVideo } from '@/services/videos';
import { selectOnline, useApp } from '@/stores/appStore';
import { MODULE_ICON, formatDuration } from '@/tutor/progress';

const KIND_ICON: Record<string, string> = { lesson: '▫️', practice: '✍️', revision: '🔁', project: '🛠️', assessment: '🏁' };

export default function PackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useApp(selectOnline);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const { data: pack } = useLocalData(() => getPackDetail(id), id);
  const downloading = usePackDownloads((s) => s.active[id]);
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [storageBusy, setStorageBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showModules, setShowModules] = useState(false);

  const screenItems = useMemo(
    () => (pack?.modules ?? []).flatMap((m) => m.topics.map((t) => ({ title: t.title, href: `/packs/${id}/topic/${t.id}` as const }))),
    [pack, id],
  );
  usePublishScreen(screenItems);

  if (pack === undefined) return <View style={ui.screen} />;
  if (pack === null) {
    return (
      <View style={ui.screen}>
        <Header title="Learning Pack" back="/packs" />
        <View style={ui.content}>
          <Text style={ui.muted}>This pack isn’t on your phone.</Text>
          {online ? <Button label="View pack" onPress={() => router.replace(`/packs/preview/${id}`)} style={s.mt} /> : null}
        </View>
      </View>
    );
  }

  const update = pack.latestVersion != null && pack.latestVersion > pack.version;
  const current = pack.modules.flatMap((m) => m.topics).find((t) => t.id === pack.resumeTopicId);
  const titleOf = (topicId: string | null) => pack.modules.flatMap((m) => m.topics).find((t) => t.id === topicId)?.title;

  const pinOffline = async () => {
    setError(null);
    try {
      await makeAvailableOffline(id, pack.version);
      setModal(false);
    } catch (err) {
      setError(err instanceof PackDownloadError ? err.message : errorMessage(err));
    }
  };

  const applyUpdate = async () => {
    setError(null);
    try {
      await downloadPack(id, pack.latestVersion!, { offline: pack.offline });
    } catch (err) {
      setError(err instanceof PackDownloadError ? err.message : errorMessage(err));
    }
  };

  const exportProgress = async () => {
    await Share.share({ title: `${pack.title} — my progress`, message: await exportPackProgress(id) });
  };

  const optimize = async () => {
    setStorageBusy('optimize');
    setNotice(null);
    try {
      const saved = await optimizePack(id);
      setNotice(saved > 0 ? `Saved ${formatBytes(saved)}. Lessons, quizzes and your progress are untouched.` : 'Already as small as it can be.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStorageBusy(null);
    }
  };

  const restore = async () => {
    setStorageBusy('restore');
    setNotice(null);
    try {
      const r = await restorePack(id);
      setNotice(r.videosPending ? `Restored. ${r.videosPending} video${r.videosPending === 1 ? '' : 's'} will download when you're online.` : 'Full pack restored.');
    } finally {
      setStorageBusy(null);
    }
  };

  const downloadAllVideos = async () => {
    setStorageBusy('videos');
    setNotice(null);
    let failed = 0;
    for (const v of (await listTopicVideos(id)).filter((x) => x.downloadable && x.status !== 'downloaded')) {
      try {
        await downloadVideo(id, v.id);
      } catch {
        failed++;
      }
    }
    setStorageBusy(null);
    setNotice(failed ? `${failed} video${failed === 1 ? '' : 's'} could not be downloaded. Try again later.` : 'Videos saved for offline viewing.');
  };

  const confirmDelete = () =>
    Alert.alert('Delete this pack?', 'It will be removed from this phone and your library. Your progress is kept if you download it again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Export progress first', onPress: () => void exportProgress() },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePack(id);
          router.replace('/packs');
        },
      },
    ]);

  const loadInsights = async () => {
    setInsightsBusy(true);
    setError(null);
    try {
      setInsights(await getInsights(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInsightsBusy(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Header title={pack.title} subtitle={levelLabel(pack.levelFrom, pack.levelTo)} back="/packs" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card>
          <View style={s.heroRow}>
            <Text style={s.icon}>{pack.icon}</Text>
            <View style={s.flex}>
              <Text style={s.progressLabel}>Progress: {pack.percent}%</Text>
              <ProgressBar value={pack.percent / 100} height={10} />
              <Text style={[ui.muted, s.mt6]}>
                {pack.stats.completedTopics}/{pack.stats.topicCount} topics · {formatDuration(pack.stats.timeSpentSec)} studied
                {pack.stats.accuracy != null ? ` · ${Math.round(pack.stats.accuracy * 100)}% correct` : ''}
              </Text>
            </View>
          </View>
          <View style={s.badges}>
            {downloading ? (
              <Badge label={`Downloading ${Math.round(downloading.progress * 100)}%`} tone="amber" />
            ) : pack.offline ? (
              <Badge label={`✓ Offline Available · ${formatBytes(pack.sizeBytes)}`} />
            ) : (
              <Badge label="Online only — not pinned for offline" tone="grey" />
            )}
            <Badge label={`v${pack.version}`} tone="grey" />
          </View>

          {error ? <Text style={[ui.error, s.mt]}>{error}</Text> : null}

          <View style={s.actions}>
            {current ? (
              <Button label={pack.percent > 0 ? `Continue: ${current.title}` : 'Start Learning'} onPress={() => router.push(`/packs/${id}/topic/${current.id}`)} />
            ) : null}
            <Button label="🤖 Ask the AI Tutor" kind="secondary" onPress={() => router.push(`/packs/${id}/tutor`)} />
            {!pack.offline ? <Button label="Download for Offline" kind="secondary" onPress={() => setModal(true)} disabled={!online} /> : null}
          </View>
        </Card>

        {pack.plan ? (
          <Card>
            <View style={s.planHead}>
              <Text style={s.dayBig}>
                Day {pack.plan.currentDay ?? 1} <Text style={s.dayOf}>/ {pack.plan.durationDays}</Text>
              </Text>
              <Badge label={pack.plan.depth[0].toUpperCase() + pack.plan.depth.slice(1)} />
            </View>
            {pack.plan.coverageStatement ? <Text style={ui.body}>{pack.plan.coverageStatement}</Text> : null}
            <Text style={[ui.muted, s.mt6]}>
              {pack.plan.daysDone} of {pack.plan.durationDays} days done · about {pack.plan.dailyMinutes} min a day
              {pack.plan.goal ? ` · goal: ${pack.plan.goal}` : ''}
            </Text>
          </Card>
        ) : null}

        {update ? (
          <Card style={s.update}>
            <Text style={s.updateTitle}>↻ Version {pack.latestVersion} is available</Text>
            <Text style={ui.muted}>Your progress carries over: topics keep their place, and anything removed is kept in your history.</Text>
            <Button label="Update pack" onPress={applyUpdate} disabled={!online || !!downloading} busy={!!downloading} style={s.mt} />
          </Card>
        ) : null}

        {pack.weakTopics.length ? (
          <>
            <Text style={ui.sectionTitle}>Weak topics</Text>
            <Card>
              {pack.weakTopics.map((t) => (
                <Pressable key={t.id} style={s.weakRow} onPress={() => router.push(`/packs/${id}/topic/${t.id}`)}>
                  <Text style={s.weakTitle}>⚠️ {t.title}</Text>
                  <Text style={s.weakPct}>{Math.round(t.accuracy * 100)}%</Text>
                </Pressable>
              ))}
              <Button
                label="Revise with the tutor"
                kind="ghost"
                onPress={() => router.push({ pathname: '/packs/[id]/tutor', params: { id, q: 'What am I weak at?' } })}
              />
            </Card>
          </>
        ) : null}

        {online && authed ? (
          <>
            <Text style={ui.sectionTitle}>AI study plan</Text>
            <Card>
              {insights ? (
                <>
                  <Text style={ui.body}>{insights.summary}</Text>
                  {insights.misconceptions.map((m) => (
                    <Text key={m} style={[ui.body, s.mt6]}>🧩 {m}</Text>
                  ))}
                  {insights.nextSteps.map((n, i) => (
                    <Pressable key={i} onPress={() => n.topicId && router.push(`/packs/${id}/topic/${n.topicId}`)}>
                      <Text style={[ui.body, s.mt6]}>
                        {i + 1}. {n.action}
                        {n.topicId && titleOf(n.topicId) ? <Text style={s.link}> → {titleOf(n.topicId)}</Text> : null}
                      </Text>
                    </Pressable>
                  ))}
                </>
              ) : (
                <Text style={ui.muted}>Get a personal plan from your quiz results and progress.</Text>
              )}
              <Button label={insights ? 'Refresh plan' : 'Analyse my progress'} kind="secondary" onPress={loadInsights} busy={insightsBusy} style={s.mt} />
            </Card>
          </>
        ) : null}

        {pack.days.length ? (
          <>
            <Text style={ui.sectionTitle}>Day-by-day plan</Text>
            {pack.days.map((d) => {
              const open = openModule === `d${d.dayNumber}` || (openModule === null && d.dayNumber === pack.plan?.currentDay);
              return (
                <View key={d.dayNumber} style={s.module}>
                  <Pressable style={s.moduleRow} onPress={() => setOpenModule(open ? '' : `d${d.dayNumber}`)}>
                    <Text style={s.moduleIcon}>{MODULE_ICON[d.status]}</Text>
                    <View style={s.flex}>
                      <Text style={s.moduleTitle}>Day {d.dayNumber}: {d.title}</Text>
                      <Text style={ui.muted}>
                        ~{d.estimatedMinutes} min · {d.topics.filter((t) => t.completed).length}/{d.topics.length} done
                      </Text>
                    </View>
                    <Text style={s.chev}>{open ? '▾' : '▸'}</Text>
                  </Pressable>
                  {open ? (
                    <>
                      {d.topics.map((t) => (
                        <Pressable key={t.id} style={s.topicRow} onPress={() => router.push(`/packs/${id}/topic/${t.id}`)}>
                          <Text style={s.topicIcon}>{t.completed ? '✅' : t.id === pack.resumeTopicId ? '▶️' : KIND_ICON[t.kind] ?? '▫️'}</Text>
                          <Text style={[s.topicTitle, t.id === pack.resumeTopicId && s.current]} numberOfLines={2}>{t.title}</Text>
                          {t.weak ? <Text>⚠️</Text> : null}
                          {t.bookmarked ? <Text>🔖</Text> : null}
                        </Pressable>
                      ))}
                      {d.completionCriteria ? <Text style={s.criteria}>Done when: {d.completionCriteria}</Text> : null}
                    </>
                  ) : null}
                </View>
              );
            })}
            <Pressable onPress={() => setShowModules((x) => !x)}>
              <Text style={s.link}>{showModules ? 'Hide modules' : 'Show by module'}</Text>
            </Pressable>
          </>
        ) : null}

        {!pack.days.length || showModules ? <Text style={ui.sectionTitle}>Modules</Text> : null}
        {(!pack.days.length || showModules ? pack.modules : []).map((m) => {
          const done = m.topics.filter((t) => t.completed).length;
          const open = openModule === m.id || (openModule === null && m.topics.some((t) => t.id === pack.resumeTopicId));
          return (
            <View key={m.id} style={s.module}>
              <Pressable style={s.moduleRow} onPress={() => setOpenModule(open ? '' : m.id)}>
                <Text style={s.moduleIcon}>{MODULE_ICON[m.status]}</Text>
                <View style={s.flex}>
                  <Text style={s.moduleTitle}>
                    Module {m.position}: {m.title}
                  </Text>
                  <Text style={ui.muted}>
                    {done}/{m.topics.length} topics
                    {m.status === 'locked' ? ' · finish the previous module first (recommended)' : ''}
                  </Text>
                </View>
                <Text style={s.chev}>{open ? '▾' : '▸'}</Text>
              </Pressable>
              {open
                ? m.topics.map((t) => (
                    <Pressable key={t.id} style={s.topicRow} onPress={() => router.push(`/packs/${id}/topic/${t.id}`)}>
                      <Text style={s.topicIcon}>{t.completed ? '✅' : t.id === pack.resumeTopicId ? '▶️' : '▫️'}</Text>
                      <Text style={[s.topicTitle, t.id === pack.resumeTopicId && s.current]} numberOfLines={2}>
                        {t.title}
                      </Text>
                      {t.weak ? <Text>⚠️</Text> : null}
                      {t.bookmarked ? <Text>🔖</Text> : null}
                    </Pressable>
                  ))
                : null}
            </View>
          );
        })}

        {pack.bookmarks.length ? (
          <>
            <Text style={ui.sectionTitle}>Bookmarks</Text>
            {pack.bookmarks.map((b) => (
              <Pressable key={b.id} onPress={() => router.push(`/packs/${id}/topic/${b.id}`)}>
                <Text style={[ui.body, s.bookmark]}>🔖 {b.title}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={ui.sectionTitle}>Videos & storage</Text>
        <Card>
          <Text style={ui.body}>
            {pack.videos.total
              ? `${pack.videos.downloaded} of ${pack.videos.total} videos on this phone${pack.videos.bytes ? ` (${formatBytes(pack.videos.bytes)})` : ''}.`
              : 'This pack has no videos.'}
          </Text>
          <Text style={[ui.muted, s.mt6]}>
            Last used {timeAgo(pack.lastUsedAt)}.{' '}
            {pack.optimizedAt ? `Optimised — saved ${formatBytes(pack.bytesSaved)}. Lessons, quizzes and progress are untouched.` : ''}
          </Text>
          {notice ? <Text style={[ui.body, s.mt6]}>{notice}</Text> : null}
          <View style={s.actions}>
            {pack.videos.downloadable > 0 ? (
              <Button
                label={`Save ${pack.videos.downloadable} video${pack.videos.downloadable === 1 ? '' : 's'} for offline`}
                kind="secondary"
                onPress={downloadAllVideos}
                disabled={!online || !!storageBusy}
                busy={storageBusy === 'videos'}
              />
            ) : null}
            {pack.optimizedAt ? (
              <Button label="Restore full pack" kind="secondary" onPress={restore} disabled={!!storageBusy} busy={storageBusy === 'restore'} />
            ) : (
              <Button label="Compress pack" kind="secondary" onPress={optimize} disabled={!!storageBusy} busy={storageBusy === 'optimize'} />
            )}
            <Button label="Export my progress" kind="ghost" onPress={exportProgress} />
          </View>
        </Card>

        <Button label="Delete pack" kind="danger" onPress={confirmDelete} style={s.delete} />
      </ScrollView>

      <DownloadModal
        visible={modal}
        packId={id}
        title={pack.title}
        sizeBytes={pack.sizeBytes}
        moduleCount={pack.modules.length}
        error={error}
        onDownload={pinOffline}
        onCancel={() => setModal(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { fontSize: 44 },
  flex: { flex: 1 },
  progressLabel: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  actions: { gap: 10, marginTop: 16 },
  mt: { marginTop: 12 },
  mt6: { marginTop: 6 },
  update: { backgroundColor: C.amberSoft, borderColor: '#EED9B0' },
  updateTitle: { fontSize: 15, fontWeight: '700', color: '#7A4E0E', marginBottom: 4 },
  weakRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  weakTitle: { fontSize: 14, color: C.text, flex: 1 },
  weakPct: { fontSize: 13, fontWeight: '700', color: C.red },
  link: { color: C.primary, fontWeight: '700' },
  module: { backgroundColor: C.card, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFE8', overflow: 'hidden' },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  moduleIcon: { fontSize: 20 },
  moduleTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  chev: { fontSize: 16, color: C.primary },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#F1F3EF' },
  topicIcon: { width: 24 },
  topicTitle: { flex: 1, fontSize: 14, color: C.body },
  current: { fontWeight: '700', color: C.primaryDark },
  bookmark: { paddingVertical: 6 },
  delete: { marginTop: 24 },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  dayBig: { fontSize: 24, fontWeight: '800', color: C.text },
  dayOf: { fontSize: 16, fontWeight: '600', color: C.muted },
  criteria: { fontSize: 12, fontStyle: 'italic', color: C.muted, paddingHorizontal: 16, paddingBottom: 10 },
});
