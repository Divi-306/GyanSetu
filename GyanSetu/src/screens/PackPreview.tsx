import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DownloadModal } from '@/components/packs/DownloadModal';
import { Badge, Button, C, Card, Header, ProgressBar, levelLabel, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import {
  PackDownloadError,
  downloadPack,
  getPackDetail,
  getRemotePack,
  makeAvailableOffline,
  retryGeneration,
  type RemotePack,
  type VersionStatus,
} from '@/services/learningPacks';
import { sharePackFile } from '@/services/storage';
import { selectOnline, useApp } from '@/stores/appStore';

const POLL_MS = 4000;

/** A generated pack before it's on the phone: its structure, generation progress, and the download offer. */
export default function PackPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useApp(selectOnline);
  const [pack, setPack] = useState<RemotePack | null>(null);
  const [version, setVersion] = useState<VersionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [openModule, setOpenModule] = useState<string | null>(null);
  const { data: local } = useLocalData(() => getPackDetail(id), id);

  // State is only set in the request's callbacks, never synchronously inside an effect.
  const load = useCallback(
    () =>
      getRemotePack(id).then(
        (res) => {
          setPack(res.pack);
          setVersion(res.version);
          setLoadError(null);
        },
        (err) => setLoadError(errorMessage(err)),
      ),
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    getRemotePack(id).then(
      (res) => {
        if (cancelled) return;
        setPack(res.pack);
        setVersion(res.version);
      },
      (err) => !cancelled && setLoadError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Poll while the server is still writing modules.
  useEffect(() => {
    if (version?.status !== 'generating') return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [version?.status, load]);

  const ready = version?.status === 'ready';
  const isOfflineHere = local?.offline && local.version >= (version?.version ?? 0);

  const download = async () => {
    if (!version) return;
    setDownloadError(null);
    try {
      await makeAvailableOffline(id, version.version, version.sha256);
      setModal(false);
      router.replace(`/packs/${id}`);
    } catch (err) {
      setDownloadError(err instanceof PackDownloadError ? err.message : errorMessage(err));
    }
  };

  const startLearning = async () => {
    if (!version) return;
    setStarting(true);
    setDownloadError(null);
    try {
      // Cached for this session (not pinned for offline unless the student chooses Download).
      if (!local || local.version < version.version) await downloadPack(id, version.version, { offline: false, expectedSha256: version.sha256 });
      router.replace(`/packs/${id}`);
    } catch (err) {
      setDownloadError(err instanceof PackDownloadError ? err.message : errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const downloadFile = async () => {
    setFileBusy(true);
    setFileError(null);
    try {
      await sharePackFile(id);
    } catch (err) {
      setFileError(errorMessage(err));
    } finally {
      setFileBusy(false);
    }
  };

  const retry = async () => {
    if (!version) return;
    try {
      setVersion((await retryGeneration(id, version.version)).version);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  };

  if (!pack || !version) {
    return (
      <View style={ui.screen}>
        <Header title="Learning Pack" back="/learn" />
        <View style={ui.content}>
          {loadError ? <Text style={ui.error}>{online ? loadError : "You're offline. Connect to see this pack."}</Text> : <Text style={ui.muted}>Loading…</Text>}
          {loadError ? <Button label="Try again" kind="secondary" onPress={load} /> : null}
        </View>
      </View>
    );
  }

  const outline = version.outline;
  const topicCount = outline.modules.reduce((n, m) => n + m.topics.length, 0);
  const plan = outline.plan;
  const topicTitle = new Map(outline.modules.flatMap((m) => m.topics.map((t) => [t.key, t] as const)));
  const KIND_ICON: Record<string, string> = { lesson: '📖', practice: '✍️', revision: '🔁', project: '🛠️', assessment: '🏁' };

  return (
    <View style={ui.screen}>
      <Header title={pack.title} subtitle={pack.subject !== pack.title ? pack.subject : undefined} back="/learn" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card>
          <View style={s.heroRow}>
            <Text style={s.icon}>{pack.icon}</Text>
            <View style={s.flex}>
              <Text style={s.title}>{pack.title}</Text>
              <Text style={ui.muted}>
                {plan ? `${plan.durationDays} days · ` : ''}
                {outline.modules.length} Modules · {topicCount} topics · {levelLabel(outline.levelRange.from, outline.levelRange.to)}
              </Text>
              <Text style={ui.muted}>
                {plan ? `About ${plan.dailyMinutes} min/day · ` : ''}Estimated: {outline.estimatedHours} hour{outline.estimatedHours === 1 ? '' : 's'}
                {version.sizeBytes ? ` · ${formatBytes(version.sizeBytes)}` : ''}
              </Text>
            </View>
          </View>
          {pack.description ? <Text style={[ui.body, s.desc]}>{pack.description}</Text> : null}

          {version.status === 'generating' ? (
            <View style={s.status}>
              <Text style={s.statusText}>
                ✍️ Writing lessons, examples and questions… {version.modulesDone}/{version.modulesTotal} modules
              </Text>
              <ProgressBar value={(version.modulesDone + 0.3) / Math.max(1, version.modulesTotal)} />
              <Text style={ui.muted}>You can leave this screen — it keeps going on our server.</Text>
            </View>
          ) : null}

          {version.status === 'failed' ? (
            <View style={s.status}>
              <Text style={ui.error}>{version.error ?? 'Some modules could not be written.'}</Text>
              <Button label="Retry" onPress={retry} disabled={!online} />
            </View>
          ) : null}

          {downloadError ? <Text style={ui.error}>{downloadError}</Text> : null}
          {fileError ? <Text style={ui.error}>{fileError}</Text> : null}

          {ready ? (
            <View style={s.actions}>
              <Button label={local ? 'Open' : 'Start Learning'} onPress={local ? () => router.replace(`/packs/${id}`) : startLearning} busy={starting} />
              {isOfflineHere ? (
                <Badge label="✓ Available offline" />
              ) : (
                <Button label="Download for Offline" kind="secondary" onPress={() => setModal(true)} disabled={!online} />
              )}
              {local ? (
                <Button label="Download pack as file" kind="ghost" onPress={downloadFile} busy={fileBusy} />
              ) : null}
            </View>
          ) : null}
        </Card>

        {ready && !isOfflineHere && !dismissed ? (
          <Card style={s.offer}>
            <Text style={s.offerTitle}>Would you like to download this learning pack for offline learning?</Text>
            <Text style={ui.muted}>Your offline AI tutor will teach from it — no internet needed.</Text>
            <View style={s.row}>
              <Button label="Not Now" kind="ghost" onPress={() => setDismissed(true)} style={s.flex} />
              <Button label="Download" onPress={() => setModal(true)} style={s.flex} disabled={!online} />
            </View>
          </Card>
        ) : null}

        {plan ? (
          <Card>
            <View style={s.depthRow}>
              <Badge label={plan.depth[0].toUpperCase() + plan.depth.slice(1)} />
              <Text style={ui.muted}>what {plan.durationDays} days realistically reach</Text>
            </View>
            <Text style={s.coverage}>{plan.coverageStatement}</Text>
            {plan.outcomes.length ? (
              <>
                <Text style={s.small}>By the end you can</Text>
                {plan.outcomes.map((o) => (
                  <Text key={o} style={[ui.body, s.bullet]}>✓ {o}</Text>
                ))}
              </>
            ) : null}
            {plan.notCovered.length ? (
              <>
                <Text style={s.small}>Not covered in {plan.durationDays} days (learn these next)</Text>
                <Text style={ui.muted}>{plan.notCovered.join(' · ')}</Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {outline.careerPaths.length ? (
          <>
            <Text style={ui.sectionTitle}>Where this can lead</Text>
            {outline.careerPaths.map((c) => (
              <Text key={c.title} style={[ui.body, s.bullet]}>
                💼 <Text style={s.bold}>{c.title}</Text> — {c.relevance}
              </Text>
            ))}
          </>
        ) : null}

        {outline.prerequisites.length ? (
          <>
            <Text style={ui.sectionTitle}>Before you start</Text>
            <Text style={ui.body}>{outline.prerequisites.join(' · ')}</Text>
          </>
        ) : null}

        {outline.learningObjectives.length ? (
          <>
            <Text style={ui.sectionTitle}>You will be able to</Text>
            {outline.learningObjectives.map((o) => (
              <Text key={o} style={[ui.body, s.bullet]}>• {o}</Text>
            ))}
          </>
        ) : null}

        {plan ? (
          <>
            <Text style={ui.sectionTitle}>Your {plan.durationDays}-day plan</Text>
            {plan.days.map((d) => (
              <Pressable key={d.dayNumber} style={s.module} onPress={() => setOpenModule(openModule === `d${d.dayNumber}` ? null : `d${d.dayNumber}`)}>
                <View style={s.moduleRow}>
                  <Text style={s.moduleNo}>{d.dayNumber}</Text>
                  <View style={s.flex}>
                    <Text style={s.moduleTitle}>Day {d.dayNumber}: {d.title}</Text>
                    <Text style={ui.muted} numberOfLines={openModule === `d${d.dayNumber}` ? undefined : 1}>
                      ~{d.estimatedMinutes} min · {d.topicKeys.map((k) => topicTitle.get(k)?.title).filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <Text style={s.chev}>{openModule === `d${d.dayNumber}` ? '▾' : '▸'}</Text>
                </View>
                {openModule === `d${d.dayNumber}` ? (
                  <>
                    {d.topicKeys.map((k) => (
                      <Text key={k} style={s.topic}>
                        {KIND_ICON[topicTitle.get(k)?.kind ?? 'lesson']} {topicTitle.get(k)?.title ?? k}
                      </Text>
                    ))}
                    {d.completionCriteria ? <Text style={[s.topic, s.criteria]}>Done when: {d.completionCriteria}</Text> : null}
                  </>
                ) : null}
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={ui.sectionTitle}>{plan ? 'Modules' : 'Structure'}</Text>
        {outline.modules.map((m, i) => {
          const written = version.status === 'ready' || i < version.modulesDone;
          return (
            <Pressable key={m.key} style={s.module} onPress={() => setOpenModule(openModule === m.key ? null : m.key)}>
              <View style={s.moduleRow}>
                <Text style={s.moduleNo}>{i + 1}</Text>
                <View style={s.flex}>
                  <Text style={s.moduleTitle}>{m.title}</Text>
                  <Text style={ui.muted} numberOfLines={openModule === m.key ? undefined : 1}>{m.description}</Text>
                </View>
                {version.status === 'generating' ? <Text>{written ? '✅' : '⏳'}</Text> : <Text style={s.chev}>{openModule === m.key ? '▾' : '▸'}</Text>}
              </View>
              {openModule === m.key
                ? m.topics.map((t) => (
                    <Text key={t.key} style={s.topic}>
                      ├ {t.title} <Text style={s.diff}>· {t.difficulty}</Text>
                    </Text>
                  ))
                : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <DownloadModal
        visible={modal}
        packId={id}
        title={pack.title}
        sizeBytes={version.sizeBytes}
        moduleCount={outline.modules.length}
        error={downloadError}
        onDownload={download}
        onCancel={() => {
          setModal(false);
          setDownloadError(null);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  heroRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  icon: { fontSize: 44 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 4 },
  desc: { marginTop: 12 },
  flex: { flex: 1 },
  status: { marginTop: 14, gap: 8 },
  statusText: { fontSize: 14, color: C.body, fontWeight: '600' },
  actions: { marginTop: 16, gap: 10 },
  offer: { backgroundColor: C.soft, borderColor: C.softBorder },
  offerTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  bullet: { marginBottom: 4 },
  module: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFE8' },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moduleNo: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: C.soft, textAlign: 'center', lineHeight: 28,
    fontWeight: '700', color: C.primaryDark,
  },
  moduleTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  chev: { fontSize: 16, color: C.primary },
  topic: { fontSize: 13, color: C.body, marginTop: 6, marginLeft: 40 },
  diff: { color: C.muted, fontSize: 12 },
  depthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverage: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 10, lineHeight: 22 },
  small: { fontSize: 12, fontWeight: '800', color: C.primaryDark, marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
  bold: { fontWeight: '700', color: C.text },
  criteria: { fontStyle: 'italic', color: C.muted },
});
