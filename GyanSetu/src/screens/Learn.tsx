import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, C, Card, Header, levelLabel, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { ApiError, errorMessage } from '@/lib/api';
import { explorePacks, generatePack, listMyPacks, type ExplorePack } from '@/services/learningPacks';
import { selectOnline, useApp } from '@/stores/appStore';
import type { Level } from '@/tutor/types';

const LEVELS: { label: string; value: Level | undefined }[] = [
  { label: 'Auto', value: undefined },
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

const DURATIONS = [5, 7, 10, 15, 30, 60, 90];
const DAILY = [15, 30, 45, 60, 90, 120];

// Example prompts only — any subject works. These are not a course list.
const IDEAS = ['Computer Networks', 'React Hooks', 'Longest Valid Parentheses', 'Calculus', 'Indian Constitution', 'Graph Algorithms'];

export default function Learn() {
  // Prefill from career guidance ("Recommended next pack: TypeScript — 10 days").
  const params = useLocalSearchParams<{ subject?: string; days?: string; goal?: string }>();
  const online = useApp(selectOnline);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const [subject, setSubject] = useState(params.subject ?? '');
  const [goal, setGoal] = useState(params.goal ?? '');
  const [days, setDays] = useState<number | null>(params.days ? Number(params.days) || 15 : 15);
  const [customDays, setCustomDays] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(45);
  const [level, setLevel] = useState<Level | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explore, setExplore] = useState<ExplorePack[] | null>(null);
  const { data: mine } = useLocalData(listMyPacks);

  useEffect(() => {
    if (!online) return;
    explorePacks()
      .then((r) => setExplore(r.packs))
      .catch(() => setExplore(null));
  }, [online]);

  const generate = async (text = subject) => {
    const s = text.trim();
    if (s.length < 2 || busy) return;
    if (!authed) {
      router.push('/login');
      return;
    }
    const durationDays = customDays ? Number(customDays) : days;
    if (durationDays != null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 180)) {
      setError('Choose between 1 and 180 days.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await generatePack({
        subject: s,
        level,
        goal: goal.trim() || undefined,
        durationDays: durationDays ?? undefined,
        dailyMinutes: durationDays ? dailyMinutes : undefined,
      });
      router.push(`/packs/preview/${res.pack.id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'NOT_LEARNABLE' ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const offlinePacks = (mine ?? []).filter((p) => p.offline);

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Learn Anything" subtitle="Any subject, any topic, any level" />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={s.question}>What do you want to learn?</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder='e.g. "Computer Networks" or "LeetCode 678"'
            placeholderTextColor="#98A29A"
            style={[s.input, !online && s.inputOff]}
            editable={online && !busy}
            returnKeyType="go"
            onSubmitEditing={() => generate()}
            maxLength={200}
          />
          <Text style={s.label}>Why are you learning it? (optional)</Text>
          <TextInput
            value={goal}
            onChangeText={setGoal}
            placeholder='e.g. "for data science", "for backend jobs", "for my exam"'
            placeholderTextColor="#98A29A"
            style={[s.input, s.inputSmall, !online && s.inputOff]}
            editable={online && !busy}
            maxLength={300}
          />

          <Text style={s.label}>How many days do you want to learn it?</Text>
          <View style={s.levels}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => {
                  setDays(d);
                  setCustomDays('');
                }}
                style={[s.chip, days === d && !customDays && s.chipOn]}
                disabled={!online}
              >
                <Text style={[s.chipText, days === d && !customDays && s.chipTextOn]}>{d} days</Text>
              </Pressable>
            ))}
            <TextInput
              value={customDays}
              onChangeText={(t) => setCustomDays(t.replace(/\D/g, '').slice(0, 3))}
              placeholder="Custom"
              placeholderTextColor="#98A29A"
              keyboardType="number-pad"
              style={[s.chip, s.customDays, customDays ? s.chipOn : null, customDays ? s.chipTextOn : s.chipText]}
              editable={online}
            />
            <Pressable onPress={() => { setDays(null); setCustomDays(''); }} style={[s.chip, days === null && !customDays && s.chipOn]} disabled={!online}>
              <Text style={[s.chipText, days === null && !customDays && s.chipTextOn]}>No deadline</Text>
            </Pressable>
          </View>

          {days !== null || customDays ? (
            <>
              <Text style={s.label}>Study time per day</Text>
              <View style={s.levels}>
                {DAILY.map((m) => (
                  <Pressable key={m} onPress={() => setDailyMinutes(m)} style={[s.chip, dailyMinutes === m && s.chipOn]} disabled={!online}>
                    <Text style={[s.chipText, dailyMinutes === m && s.chipTextOn]}>{m < 60 ? `${m} min` : `${m / 60} h`}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={s.label}>Your level</Text>
          <View style={s.levels}>
            {LEVELS.map((l) => (
              <Pressable key={l.label} onPress={() => setLevel(l.value)} style={[s.chip, level === l.value && s.chipOn]} disabled={!online}>
                <Text style={[s.chipText, level === l.value && s.chipTextOn]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Designing your pack…' : authed ? 'Generate Learning Pack' : 'Log in to generate'}
            onPress={() => generate()}
            disabled={!online || subject.trim().length < 2}
            busy={busy}
            style={s.generate}
          />
          {busy ? <Text style={[ui.muted, s.center]}>Designing your curriculum and day-by-day plan. This takes a few seconds.</Text> : null}
          {!online ? (
            <Text style={[ui.muted, s.center]}>You’re offline. New packs need internet — your downloaded packs work offline below.</Text>
          ) : null}
        </Card>

        {online ? (
          <>
            <Text style={ui.sectionTitle}>Try</Text>
            <View style={s.ideas}>
              {IDEAS.map((idea) => (
                <Pressable key={idea} style={s.idea} onPress={() => setSubject(idea)}>
                  <Text style={s.ideaText}>{idea}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Pressable style={s.myPacks} onPress={() => router.push('/packs')}>
          <Text style={s.myPacksIcon}>📚</Text>
          <View style={s.flex}>
            <Text style={s.myPacksTitle}>My Learning Packs</Text>
            <Text style={ui.muted}>
              {offlinePacks.length
                ? `${offlinePacks.length} available offline`
                : 'Packs you download appear here and work without internet'}
            </Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </Pressable>

        {online && explore && explore.length > 0 ? (
          <>
            <Text style={ui.sectionTitle}>Explore packs other students made</Text>
            {explore.map((p) => (
              <Pressable key={p.id} style={s.exploreRow} onPress={() => router.push(`/packs/preview/${p.id}`)}>
                <Text style={s.exploreIcon}>{p.icon}</Text>
                <View style={s.flex}>
                  <Text style={s.exploreTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={ui.muted}>
                    {p.moduleCount} modules · {levelLabel(p.level, p.level)}
                  </Text>
                </View>
                {p.source === 'course' ? <Badge label="Course" tone="grey" /> : null}
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  question: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 12 },
  input: {
    borderWidth: 1.5, borderColor: '#D5DED1', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: C.text, backgroundColor: '#FBFCFA',
  },
  inputOff: { opacity: 0.5 },
  inputSmall: { fontSize: 14, paddingVertical: 10 },
  label: { fontSize: 13, fontWeight: '700', color: C.body, marginTop: 14 },
  generate: { marginTop: 14 },
  customDays: { minWidth: 76, paddingVertical: 5, textAlign: 'center', fontWeight: '600' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.primaryDark, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  center: { textAlign: 'center', marginTop: 10 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  idea: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3E8DF' },
  ideaText: { fontSize: 13, color: C.body },
  myPacks: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.soft, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.softBorder, marginBottom: 18,
  },
  myPacksIcon: { fontSize: 26 },
  myPacksTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  arrow: { fontSize: 24, color: C.primary },
  flex: { flex: 1 },
  exploreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEF1EB',
  },
  exploreIcon: { fontSize: 24, width: 32, textAlign: 'center' },
  exploreTitle: { fontSize: 15, fontWeight: '600', color: C.text },
});
