import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Href } from 'expo-router';
import { goBackOr } from '@/lib/nav';
import { selectOnline, useApp } from '@/stores/appStore';

/** The app's palette (same values as the existing screens). */
export const C = {
  bg: '#FFFDF8',
  card: '#FFFFFF',
  soft: '#F1F6ED',
  softBorder: '#DCE7D6',
  primary: '#5F8068',
  primaryDark: '#315C43',
  text: '#20352A',
  body: '#4A564C',
  muted: '#7A847D',
  amber: '#D79A35',
  amberSoft: '#F7EBD5',
  red: '#B3261E',
  redSoft: '#FBE9E7',
  green: '#3B8D5A',
};

/** 🟢 Online / 🔴 Offline. "Online" means the GyanSetu server answered, not just that Wi-Fi is on. */
export function ConnectionPill() {
  const online = useApp(selectOnline);
  return (
    <View style={[styles.pill, { backgroundColor: online ? '#E6F2E8' : C.redSoft }]}>
      <Text style={styles.pillText}>{online ? '🟢 Online' : '🔴 Offline'}</Text>
    </View>
  );
}

export function Header({ title, subtitle, back = '/dashboard', right }: { title: string; subtitle?: string; back?: Href; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={() => goBackOr(back)} accessibilityLabel="Back" hitSlop={8}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ?? <ConnectionPill />}
    </View>
  );
}

export function ProgressBar({ value, color = C.primary, height = 8 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, kind = 'primary', disabled, busy, style }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.btn, styles[kind], off && styles.btnOff, pressed && !off && styles.btnPressed, style]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? '#fff' : C.primaryDark} />
      ) : (
        <Text style={[styles.btnText, kind === 'primary' ? styles.btnTextPrimary : kind === 'danger' ? styles.btnTextDanger : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'green' }: { label: string; tone?: 'green' | 'amber' | 'red' | 'grey' }) {
  const bg = { green: '#E6F2E8', amber: C.amberSoft, red: C.redSoft, grey: '#EEF0EC' }[tone];
  const fg = { green: '#2F6B45', amber: '#8A5A12', red: C.red, grey: '#5B655E' }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** "Programming ████████░░ 80%" */
export function StatBar({ label, value, color = C.primary }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.statBar}>
        <ProgressBar value={value / 100} color={color} />
      </View>
      <Text style={styles.statValue}>{Math.round(value)}%</Text>
    </View>
  );
}

/** Seven vertical bars: minutes studied per day this week. */
export function WeekBars({ week }: { week: { day: string; minutes: number }[] }) {
  const max = Math.max(30, ...week.map((d) => d.minutes));
  const name = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
  return (
    <View style={styles.week}>
      {week.map((d) => (
        <View key={d.day} style={styles.weekCol} accessibilityLabel={`${name(d.day)}: ${d.minutes} minutes`}>
          <Text style={styles.weekMin}>{d.minutes ? d.minutes : ''}</Text>
          <View style={styles.weekTrack}>
            <View style={[styles.weekFill, { height: `${(d.minutes / max) * 100}%` }]} />
          </View>
          <Text style={styles.weekDay}>{name(d.day)}</Text>
        </View>
      ))}
    </View>
  );
}

export const levelLabel = (from: string, to: string) => {
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  return from && to && from !== to ? `${cap(from)} → ${cap(to)}` : cap(from || to);
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26, color: C.primaryDark, marginTop: -3 },
  headerText: { flex: 1 },
  title: { fontSize: 19, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  pillText: { fontSize: 12, fontWeight: '600', color: '#3F4A42' },
  track: { backgroundColor: '#E5ECE2', overflow: 'hidden', width: '100%' },
  btn: { minHeight: 48, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: C.primary },
  secondary: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.primary },
  danger: { backgroundColor: C.card, borderWidth: 1.5, borderColor: '#E3B4AE' },
  ghost: { backgroundColor: 'transparent' },
  btnOff: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  btnText: { fontSize: 15, fontWeight: '700', color: C.primaryDark },
  btnTextPrimary: { color: '#fff' },
  btnTextDanger: { color: C.red },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#ECEFE8', marginBottom: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 8, marginBottom: 10 },
  muted: { fontSize: 13, color: C.muted, lineHeight: 19 },
  body: { fontSize: 14, color: C.body, lineHeight: 21 },
  error: { color: C.red, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statLabel: { width: 110, fontSize: 13, color: C.body },
  statBar: { flex: 1 },
  statValue: { width: 40, fontSize: 12, fontWeight: '700', color: C.primaryDark, textAlign: 'right' },
  week: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, marginTop: 6 },
  weekCol: { alignItems: 'center', flex: 1 },
  weekMin: { fontSize: 10, color: C.muted, marginBottom: 3 },
  weekTrack: { width: 18, height: 80, borderRadius: 6, backgroundColor: '#EEF2EB', justifyContent: 'flex-end', overflow: 'hidden' },
  weekFill: { width: '100%', backgroundColor: C.primary, borderRadius: 6 },
  weekDay: { fontSize: 11, color: C.muted, marginTop: 4 },
});
