import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Markdown } from '@/components/Markdown';
import { Badge, Button, C, Card, Header, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { addTimeSpent, fetchMoreQuestions, getTopic, markTopicCompleted, recordTopicOpened, toggleBookmark, type LocalVideo } from '@/services/learningPacks';
import { VideoError, downloadVideo, importUserVideo, removeVideoFile, useVideoDownloads } from '@/services/videos';
import { selectOnline, useApp } from '@/stores/appStore';

const KIND_LABEL: Record<string, string> = { practice: '✍️ Practice', revision: '🔁 Revision', project: '🛠️ Project', assessment: '🏁 Assessment' };

export default function TopicViewer() {
  const { id, topicId } = useLocalSearchParams<{ id: string; topicId: string }>();
  const online = useApp(selectOnline);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const { data } = useLocalData(() => getTopic(id, topicId), `${id}/${topicId}`);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreMsg, setMoreMsg] = useState<{ topicId: string; text: string } | null>(null);
  const [videoMsg, setVideoMsg] = useState<{ topicId: string; text: string } | null>(null);
  const downloads = useVideoDownloads((st) => st.active);
  const scrollRef = useRef<ScrollView>(null);

  // Opening a topic makes it "where I left off"; time on screen counts as study time.
  useEffect(() => {
    void recordTopicOpened(id, topicId);
    let since = Date.now();
    const flushTime = () => {
      void addTimeSpent(id, topicId, (Date.now() - since) / 1000);
      since = Date.now();
    };
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') since = Date.now();
      else flushTime();
    });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    return () => {
      sub.remove();
      flushTime();
    };
  }, [id, topicId]);

  if (!data) return <View style={ui.screen} />;
  const { topic } = data;

  const tutor = (q: string) => router.push({ pathname: '/packs/[id]/tutor', params: { id, q } });

  const playOrOpen = (v: LocalVideo) => {
    if (v.status === 'downloaded' && v.localUri) router.push({ pathname: '/packs/[id]/video/[videoId]', params: { id, videoId: v.id } });
    else if (!online) setVideoMsg({ topicId, text: 'This video isn’t saved on your phone. It requires an internet connection.' });
    else if (v.source === 'youtube') void Linking.openURL(v.url); // stream-only: opens in YouTube / the browser
    else router.push({ pathname: '/packs/[id]/video/[videoId]', params: { id, videoId: v.id } }); // streams from the source
  };
  const saveVideo = async (v: LocalVideo) => {
    setVideoMsg(null);
    try {
      await downloadVideo(id, v.id);
    } catch (err) {
      setVideoMsg({ topicId, text: err instanceof VideoError ? err.message : errorMessage(err) });
    }
  };
  const addOwnVideo = async () => {
    setVideoMsg(null);
    try {
      if (await importUserVideo(id, topicId)) setVideoMsg({ topicId, text: 'Added. Your video stays on this phone only.' });
    } catch (err) {
      setVideoMsg({ topicId, text: err instanceof VideoError ? err.message : 'Could not add that video.' });
    }
  };
  const go = (target: string | null) => target && router.replace(`/packs/${id}/topic/${target}`);

  const completeAndNext = async () => {
    await markTopicCompleted(id, topicId);
    if (data.nextId) go(data.nextId);
    else router.replace(`/packs/${id}`);
  };

  const more = async () => {
    setMoreBusy(true);
    setMoreMsg(null);
    try {
      const r = await fetchMoreQuestions(id, topicId);
      setMoreMsg({ topicId, text: `Added ${r.mcqs} quiz and ${r.viva} viva questions — they work offline too.` });
    } catch (err) {
      setMoreMsg({ topicId, text: errorMessage(err) });
    } finally {
      setMoreBusy(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Header
        title={data.moduleTitle}
        subtitle={`${data.packTitle} · Topic ${data.index} of ${data.total}`}
        back={`/packs/${id}`}
        right={
          <Pressable onPress={() => toggleBookmark(id, topicId, !data.bookmarked)} hitSlop={10} accessibilityLabel="Bookmark">
            <Text style={s.bookmark}>{data.bookmarked ? '🔖' : '📑'}</Text>
          </Pressable>
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={ui.content}>
        <Text style={s.title}>{topic.title}</Text>
        <View style={s.badges}>
          <Badge label={topic.difficulty} tone="grey" />
          <Badge label={`~${topic.estimatedMinutes} min`} tone="grey" />
          {data.dayNumber ? <Badge label={`Day ${data.dayNumber}`} /> : null}
          {data.kind !== 'lesson' ? <Badge label={KIND_LABEL[data.kind] ?? data.kind} tone="amber" /> : null}
          {data.completed ? <Badge label="✓ Completed" /> : null}
          {data.weak ? <Badge label={`⚠ Weak · ${Math.round((data.accuracy ?? 0) * 100)}%`} tone="red" /> : null}
        </View>

        {topic.objectives.length ? (
          <Card style={s.soft}>
            <Text style={s.label}>You’ll learn to</Text>
            {topic.objectives.map((o) => (
              <Text key={o} style={ui.body}>• {o}</Text>
            ))}
          </Card>
        ) : null}

        {topic.simpleExplanation ? (
          <Card style={s.simple}>
            <Text style={s.label}>In simple words</Text>
            <Text style={ui.body}>{topic.simpleExplanation}</Text>
            {topic.analogy ? <Text style={[ui.body, s.mt]}>💡 {topic.analogy}</Text> : null}
          </Card>
        ) : null}

        <Markdown source={topic.explanation} skipFirstHeading />

        {data.videos.length ? (
          <>
            <Text style={ui.sectionTitle}>Videos</Text>
            {data.videos.map((v) => {
              const progress = downloads[`${id}/${v.id}`];
              const mins = v.durationSec ? `${Math.max(1, Math.round(v.durationSec / 60))} min` : '';
              const status =
                v.status === 'downloaded'
                  ? `✓ On this phone${v.sizeBytes ? ` · ${formatBytes(v.sizeBytes)}` : ''}`
                  : v.downloadable
                    ? v.status === 'offloaded'
                      ? 'Removed to save space · download again'
                      : 'Can be saved for offline'
                    : 'Stream only · needs internet';
              return (
                <Card key={v.id} style={s.video}>
                  <Pressable onPress={() => playOrOpen(v)} accessibilityRole="button" accessibilityLabel={`Play ${v.title}`}>
                    <Text style={s.videoTitle}>▶ {v.title}</Text>
                    <Text style={ui.muted}>
                      {[mins, v.source === 'user' ? 'Your video' : v.source === 'youtube' ? 'YouTube' : 'Wikimedia Commons'].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={[ui.muted, s.videoStatus]}>{progress != null ? `Downloading ${Math.round(progress * 100)}%` : status}</Text>
                    {v.positionSec > 5 && !v.completed ? <Text style={ui.muted}>Resume at {Math.floor(v.positionSec / 60)}:{String(Math.floor(v.positionSec % 60)).padStart(2, '0')}</Text> : null}
                    {v.completed ? <Text style={ui.muted}>✓ Watched</Text> : null}
                    {v.source !== 'user' ? <Text style={s.licence}>{v.license}{v.attribution ? ` · ${v.attribution}` : ''}</Text> : null}
                  </Pressable>
                  <View style={s.videoActions}>
                    {v.downloadable && v.status !== 'downloaded' && progress == null ? (
                      <Button label="Save for offline" kind="secondary" onPress={() => void saveVideo(v)} disabled={!online} style={s.videoBtn} />
                    ) : null}
                    {v.status === 'downloaded' ? (
                      <Button label={v.source === 'user' ? 'Remove' : 'Remove download'} kind="ghost" onPress={() => void removeVideoFile(id, v.id)} style={s.videoBtn} />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </>
        ) : null}
        <Button label="+ Add my own video" kind="ghost" onPress={addOwnVideo} />
        {videoMsg?.topicId === topicId ? <Text style={ui.muted}>{videoMsg.text}</Text> : null}

        {topic.formulas.length ? (
          <Card>
            <Text style={s.label}>Formulas</Text>
            {topic.formulas.map((f) => (
              <View key={f.name + f.expression} style={s.formula}>
                <Text style={s.formulaExpr}>{f.expression}</Text>
                <Text style={ui.muted}>
                  {f.name} — {f.meaning}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {topic.keyPoints.length ? (
          <Card>
            <Text style={s.label}>Key points</Text>
            {topic.keyPoints.map((k) => (
              <Text key={k} style={[ui.body, s.point]}>✔ {k}</Text>
            ))}
          </Card>
        ) : null}

        {topic.examples.map((e, i) => (
          <Card key={i}>
            <Text style={s.label}>Example{topic.examples.length > 1 ? ` ${i + 1}` : ''}: {e.title}</Text>
            <Markdown
              source={[
                e.body,
                e.code ? `\`\`\`${e.language}\n${e.code}\n\`\`\`` : '',
                e.steps.length ? e.steps.map((st, k) => `${k + 1}. ${st}`).join('\n') : '',
              ]
                .filter(Boolean)
                .join('\n\n')}
            />
          </Card>
        ))}

        {topic.commonMistakes.length ? (
          <Card style={s.mistakes}>
            <Text style={s.label}>Common mistakes</Text>
            {topic.commonMistakes.map((m) => (
              <View key={m.mistake} style={s.mistake}>
                <Text style={ui.body}>❌ {m.mistake}</Text>
                <Text style={[ui.body, s.fix]}>✅ {m.correction}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {data.flashcards.length ? (
          <>
            <Text style={ui.sectionTitle}>Flashcards</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cards}>
              {data.flashcards.map((f) => (
                <Pressable key={f.id} style={[s.flashcard, flipped[f.id] && s.flashcardBack]} onPress={() => setFlipped((x) => ({ ...x, [f.id]: !x[f.id] }))}>
                  <Text style={s.flashText}>{flipped[f.id] ? f.back : f.front}</Text>
                  <Text style={s.flip}>{flipped[f.id] ? 'Answer' : 'Tap to flip'}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {topic.summary ? (
          <Card style={s.soft}>
            <Text style={s.label}>Summary</Text>
            <Text style={ui.body}>{topic.summary}</Text>
          </Card>
        ) : null}

        <Text style={ui.sectionTitle}>Practise with your tutor</Text>
        <View style={s.chips}>
          {['Explain simply', 'Give an example', 'Quiz me on this', 'Take my viva', 'Practice'].map((q) => (
            <Pressable key={q} style={s.chip} onPress={() => tutor(q)}>
              <Text style={s.chipText}>{q}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={ui.muted}>
          {data.counts.mcq ?? 0} quiz · {data.counts.viva ?? 0} viva · {data.counts.practice ?? 0} practice questions on this topic
        </Text>
        {online && authed ? (
          <Button label="Get more questions (online)" kind="ghost" onPress={more} busy={moreBusy} />
        ) : null}
        {moreMsg?.topicId === topicId ? <Text style={ui.muted}>{moreMsg.text}</Text> : null}

        <View style={s.nav}>
          <Button label="‹ Previous" kind="secondary" onPress={() => go(data.previousId)} disabled={!data.previousId} style={s.flex} />
          <Button label={data.nextId ? 'Done · Next ›' : 'Finish ✓'} onPress={completeAndNext} style={s.flex} />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  bookmark: { fontSize: 24 },
  label: { fontSize: 13, fontWeight: '800', color: C.primaryDark, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  soft: { backgroundColor: C.soft, borderColor: C.softBorder },
  simple: { backgroundColor: '#FFF8E8', borderColor: '#F1E2BC' },
  mt: { marginTop: 8 },
  formula: { marginBottom: 10 },
  formulaExpr: { fontFamily: 'monospace', fontSize: 15, color: C.text, marginBottom: 2 },
  point: { marginBottom: 6 },
  mistakes: { backgroundColor: '#FFF6F5', borderColor: '#F3D9D5' },
  mistake: { marginBottom: 10 },
  fix: { marginTop: 2 },
  cards: { gap: 10, paddingBottom: 6, marginBottom: 12 },
  flashcard: {
    width: 220, minHeight: 130, borderRadius: 16, padding: 16, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.softBorder,
    justifyContent: 'space-between',
  },
  flashcardBack: { backgroundColor: C.soft },
  flashText: { fontSize: 15, color: C.text, fontWeight: '600', lineHeight: 21 },
  flip: { fontSize: 11, color: C.muted, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder },
  chipText: { fontSize: 13, color: C.primaryDark, fontWeight: '600' },
  nav: { flexDirection: 'row', gap: 10, marginTop: 24 },
  video: { paddingBottom: 10 },
  videoTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  videoStatus: { marginTop: 4 },
  licence: { fontSize: 11, color: C.muted, marginTop: 4 },
  videoActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  videoBtn: { minHeight: 38, flex: 1 },
  flex: { flex: 1 },
});
