import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { C, Card, Header, styles as ui } from '@/components/packs/ui';
import type { ReminderPrefs } from '@/reminders/rules';
import { ensureNotificationPermission, getReminderPrefs, setReminderPrefs } from '@/services/reminders';

const FREQUENCIES: { label: string; days: ReminderPrefs['frequencyDays'] }[] = [
  { label: 'Daily', days: 1 },
  { label: 'Every 2 days', days: 2 },
  { label: 'Every 3 days', days: 3 },
  { label: 'Weekly', days: 7 },
];

const hour = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

export default function ReminderSettings() {
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void getReminderPrefs().then(setPrefs);
  }, []);

  const update = async (patch: Partial<ReminderPrefs>) => {
    setNote(null);
    if (patch.enabled && !(await ensureNotificationPermission())) {
      setNote('Notifications are turned off for GyanSetu in your phone settings. Turn them on there to get reminders.');
      return;
    }
    setPrefs(await setReminderPrefs(patch));
  };

  if (!prefs) return <View style={ui.screen} />;
  return (
    <View style={ui.screen}>
      <Header title="Learning reminders" back="/profile" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card>
          <View style={s.row}>
            <View style={s.flex}>
              <Text style={s.title}>Notifications</Text>
              <Text style={ui.muted}>A friendly nudge when you haven’t studied for a while — never more than one at a time.</Text>
            </View>
            <Switch value={prefs.enabled} onValueChange={(v) => void update({ enabled: v })} trackColor={{ true: C.primary }} />
          </View>
          {note ? <Text style={[ui.error, s.mt]}>{note}</Text> : null}
        </Card>

        <Text style={ui.sectionTitle}>Remind me if I haven’t studied for</Text>
        <View style={s.chips}>
          {FREQUENCIES.map((f) => (
            <Pressable key={f.days} onPress={() => void update({ frequencyDays: f.days })} style={[s.chip, prefs.frequencyDays === f.days && s.chipOn]} disabled={!prefs.enabled}>
              <Text style={[s.chipText, prefs.frequencyDays === f.days && s.chipTextOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={ui.sectionTitle}>Quiet hours</Text>
        <Card>
          <Stepper label="From" value={prefs.quietStartHour} onChange={(h) => void update({ quietStartHour: h })} disabled={!prefs.enabled} />
          <Stepper label="Until" value={prefs.quietEndHour} onChange={(h) => void update({ quietEndHour: h })} disabled={!prefs.enabled} />
          <Text style={ui.muted}>
            No reminders between {hour(prefs.quietStartHour)} and {hour(prefs.quietEndHour)}.
          </Text>
        </Card>
        <Text style={ui.muted}>
          Reminders are created on your phone from your own progress (e.g. “Continue with Day 8”). They work offline and nothing is sent to a server.
        </Text>
      </ScrollView>
    </View>
  );
}

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (h: number) => void; disabled: boolean }) {
  return (
    <View style={s.stepper}>
      <Text style={ui.body}>{label}</Text>
      <View style={s.stepRow}>
        <Pressable onPress={() => onChange((value + 23) % 24)} disabled={disabled} style={s.stepBtn} accessibilityLabel={`${label} earlier`}>
          <Text style={s.stepText}>−</Text>
        </Pressable>
        <Text style={s.stepValue}>{hour(value)}</Text>
        <Pressable onPress={() => onChange((value + 1) % 24)} disabled={disabled} style={s.stepBtn} accessibilityLabel={`${label} later`}>
          <Text style={s.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 },
  mt: { marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.primaryDark, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, color: C.primaryDark },
  stepValue: { width: 64, textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.text },
});
