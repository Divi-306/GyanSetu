import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, C, Card, Header, StatBar, styles as ui } from '@/components/packs/ui';
import { errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cachedCareer, fetchCareer, fetchRoadmap, refreshCareer, type CareerState, type Roadmap } from '@/services/career';
import { selectOnline, useApp } from '@/stores/appStore';

/** AI career guidance from the student's learning — never a fixed list of careers. */
export default function Career() {
  const online = useApp(selectOnline);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const [state, setState] = useState<CareerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [roadmapBusy, setRoadmapBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void cachedCareer().then((c) => !cancelled && c && setState(c));
    if (online && authed) {
      fetchCareer().then(
        (c) => !cancelled && setState(c),
        () => {},
      );
    }
    return () => {
      cancelled = true;
    };
  }, [online, authed]);

  const refresh = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setState(await refreshCareer(force));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const g = state?.guidance ?? null;
  const pathTitle = selected ?? g?.paths[0]?.title ?? null;
  const roadmap: Roadmap | undefined = pathTitle ? g?.roadmaps[pathTitle] : undefined;

  const loadRoadmap = async (title: string) => {
    setSelected(title);
    if (g?.roadmaps[title]) return;
    setRoadmapBusy(true);
    setError(null);
    try {
      const r = await fetchRoadmap(title);
      setState((s) => (s?.guidance ? { ...s, guidance: { ...s.guidance, roadmaps: { ...s.guidance.roadmaps, [title]: r } } } : s));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRoadmapBusy(false);
    }
  };

  const startPack = (p: { subject: string; durationDays: number; goal?: string }) =>
    router.push({ pathname: '/learn', params: { subject: p.subject, days: String(p.durationDays), goal: p.goal ?? '' } });

  return (
    <View style={ui.screen}>
      <Header title="Career Guidance" subtitle="Based on what you learn" />
      <ScrollView contentContainerStyle={ui.content}>
        {!authed ? (
          <Card>
            <Text style={ui.body}>Log in so GyanSetu can use your learning history to suggest careers.</Text>
            <Button label="Log in" onPress={() => router.push('/login')} style={s.mt} />
          </Card>
        ) : null}

        {authed && (!state || state.status === 'insufficient_data') ? (
          <Card>
            <Text style={s.title}>Not enough to go on yet</Text>
            <Text style={ui.body}>
              Study a learning pack and answer a few quizzes, or add your interests and goals to your profile. Guidance is based only on those — nothing else.
            </Text>
            <View style={s.actions}>
              <Button label="Add interests & goals" kind="secondary" onPress={() => router.push('/profile/edit')} />
              <Button label="Learn something" onPress={() => router.push('/learn')} />
            </View>
          </Card>
        ) : null}

        {authed && state?.status === 'not_generated' ? (
          <Card>
            <Text style={ui.body}>Get career suggestions and a roadmap based on your learning so far.</Text>
            <Button label="Generate career guidance" onPress={() => refresh(false)} busy={busy} disabled={!online} style={s.mt} />
            {!online ? <Text style={[ui.muted, s.mt]}>This feature requires an internet connection.</Text> : null}
          </Card>
        ) : null}

        {error ? <Text style={ui.error}>{error}</Text> : null}

        {g ? (
          <>
            <Text style={ui.body}>{g.summary}</Text>
            {g.interests.length ? (
              <>
                <Text style={ui.sectionTitle}>Current interests</Text>
                <View style={s.chips}>
                  {g.interests.map((i) => (
                    <View key={i.label} style={s.chip}>
                      <Text style={s.chipText}>{i.emoji} {i.label}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={ui.sectionTitle}>Recommended career paths</Text>
            {g.paths.map((p, i) => (
              <Card key={p.title} style={pathTitle === p.title ? s.selected : undefined}>
                <View style={s.pathHead}>
                  <Text style={s.title}>
                    {i + 1}. {p.title}
                  </Text>
                  <Badge label={`Match ${p.match}%`} tone={p.match >= 70 ? 'green' : p.match >= 45 ? 'amber' : 'grey'} />
                </View>
                {p.why.map((w) => (
                  <Text key={w} style={[ui.body, s.item]}>• {w}</Text>
                ))}
                {p.skillsToImprove.length ? (
                  <>
                    <Text style={s.small}>Skills to improve</Text>
                    {p.skillsToImprove.map((k) => (
                      <Text key={k} style={[ui.body, s.item]}>□ {k}</Text>
                    ))}
                  </>
                ) : null}
                {p.nextPacks.length ? (
                  <>
                    <Text style={s.small}>Recommended next learning packs</Text>
                    {p.nextPacks.map((n) => (
                      <Pressable key={n.subject} onPress={() => startPack(n)} accessibilityRole="button">
                        <Text style={[s.link, s.item]}>→ {n.subject} — {n.durationDays} days</Text>
                      </Pressable>
                    ))}
                  </>
                ) : null}
                {p.projects.length ? (
                  <>
                    <Text style={s.small}>Project ideas</Text>
                    {p.projects.map((pr) => (
                      <Text key={pr} style={[ui.body, s.item]}>🛠️ {pr}</Text>
                    ))}
                  </>
                ) : null}
                <Button label="View career roadmap" kind="ghost" onPress={() => loadRoadmap(p.title)} disabled={!g.roadmaps[p.title] && !online} />
              </Card>
            ))}

            {pathTitle ? (
              <>
                <Text style={ui.sectionTitle}>Roadmap: {pathTitle}</Text>
                <Card>
                  {roadmap ? (
                    <>
                      <Text style={ui.muted}>Current level: {roadmap.currentLevel}</Text>
                      <View style={s.mt}>
                        {roadmap.skillAreas.map((a) => (
                          <StatBar key={a.name} label={a.name} value={a.progress} />
                        ))}
                      </View>
                      <Text style={s.small}>Next 3 steps</Text>
                      {roadmap.nextSteps.map((n, i) => (
                        <View key={n.step} style={s.step}>
                          <Text style={ui.body}>
                            {i + 1}. <Text style={s.bold}>{n.step}</Text> — {n.why}
                          </Text>
                          {n.pack ? (
                            <Pressable onPress={() => startPack(n.pack!)}>
                              <Text style={s.link}>Create a {n.pack.durationDays}-day {n.pack.subject} pack →</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      {roadmap.milestones.length ? (
                        <>
                          <Text style={s.small}>Job-ready milestones</Text>
                          {roadmap.milestones.map((m) => (
                            <Text key={m} style={[ui.body, s.item]}>◻ {m}</Text>
                          ))}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <Text style={ui.muted}>{roadmapBusy ? 'Building your roadmap…' : online ? 'Tap “View career roadmap”.' : 'This feature requires an internet connection.'}</Text>
                  )}
                </Card>
              </>
            ) : null}

            <Text style={[ui.muted, s.mt]}>
              {g.caveats} Based only on your learning packs, quiz results and the interests/goals in your profile.
              {state?.generatedAt ? ` Updated ${timeAgo(state.generatedAt)}.` : ''}
            </Text>
            <Button
              label={state?.outdated ? 'Update with my latest learning' : 'Refresh'}
              kind="secondary"
              onPress={() => refresh(true)}
              busy={busy}
              disabled={!online}
              style={s.mt}
            />
            {!online ? <Text style={[ui.muted, s.mt]}>Showing your saved guidance. Updating requires an internet connection.</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  mt: { marginTop: 12 },
  actions: { gap: 8, marginTop: 12 },
  title: { fontSize: 16, fontWeight: '800', color: C.text, flex: 1 },
  pathHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  selected: { borderColor: C.primary },
  item: { marginBottom: 4 },
  small: { fontSize: 12, fontWeight: '800', color: C.primaryDark, marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
  link: { color: C.primary, fontWeight: '700', fontSize: 14 },
  bold: { fontWeight: '700', color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder },
  chipText: { fontSize: 13, color: C.primaryDark, fontWeight: '600' },
  step: { marginBottom: 8 },
});
