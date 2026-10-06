import { router, usePathname } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { runCommand, type CommandResult } from '@/navigator/engine';
import { useNavigatorScreen } from '@/navigator/store';
import type { SearchResult } from '@/navigator/types';
import { selectOnline, useApp } from '@/stores/appStore';

/** Screens where the floating button would get in the way (sign-in flows, chat, quiz). */
const HIDDEN = [/^\/$/, /^\/login$/, /^\/signup$/, /^\/forgot-password$/, /^\/reset-password$/, /^\/ai$/, /^\/quiz\//, /^\/packs\/[^/]+\/tutor$/];

function suggestionsFor(route: string): string[] {
  if (route.startsWith('/course/') || route.startsWith('/lesson/')) {
    return ['Start the next lesson', 'Open lesson 2', 'Show my progress', 'Practise with a quiz'];
  }
  if (route === '/courses' || route === '/starter-bundle' || route === '/quizzes') {
    return ['Open the first one', 'Open my DSA course', 'Continue where I left off', 'Go back'];
  }
  return ['Continue where I left off', 'Open my courses', 'Start my next lesson', 'Find lessons about arrays', 'Show my progress'];
}

export function NavigatorHost() {
  const route = usePathname();
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const online = useApp(selectOnline);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<CommandResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (HIDDEN.some((re) => re.test(route))) return null;

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const close = () => {
    setOpen(false);
    setReply(null);
    setInput('');
  };

  const submit = async (command?: string) => {
    const text = (command ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const screen = useNavigatorScreen.getState();
      const result = await runCommand(text, {
        route,
        screenItems: screen.items,
        currentCourseId: screen.courseId,
        authed,
      });
      if (result.navigated && !result.results && result.ok) {
        // The app took them there: close the panel and confirm briefly.
        close();
        showToast(result.message);
      } else {
        setReply(result);
        setInput('');
      }
    } catch (err) {
      console.warn('[navigator]', err);
      setReply({ message: 'Something went wrong. Please try again.', navigated: false, ok: false, understoodBy: 'offline' });
    } finally {
      setBusy(false);
    }
  };

  const openResult = (r: SearchResult) => {
    close();
    router.push(r.href);
    showToast(`Opening ${r.title}.`);
  };

  return (
    <>
      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>✦  {toast}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open AI Navigator"
      >
        <Text style={styles.fabIcon}>✦</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdropTap} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Text style={styles.headerIconText}>✦</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>AI Navigator</Text>
                <Text style={styles.subtitle}>
                  {online ? 'Tell me where to go' : 'Offline — simple commands still work'}
                </Text>
              </View>
              <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="What would you like to do?"
                placeholderTextColor="#89938C"
                onSubmitEditing={() => submit()}
                returnKeyType="go"
                autoFocus
                editable={!busy}
              />
              <Pressable
                style={[styles.send, (!input.trim() || busy) && styles.sendDisabled]}
                disabled={!input.trim() || busy}
                onPress={() => submit()}
                accessibilityLabel="Go"
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendIcon}>→</Text>}
              </Pressable>
            </View>
            <Text style={styles.tip}>🎤 Tip: tap the mic on your keyboard to speak your command.</Text>

            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {busy && <Text style={styles.working}>Working on it…</Text>}

              {reply && (
                <View style={[styles.reply, !reply.ok && styles.replyWarn]}>
                  <Text style={styles.replyText}>{reply.message}</Text>
                  {reply.understoodBy === 'offline' && online === false && (
                    <Text style={styles.replyNote}>Understood offline</Text>
                  )}
                </View>
              )}

              {reply?.results?.map((r) => (
                <Pressable key={r.id} style={styles.result} onPress={() => openResult(r)}>
                  <View style={styles.resultText}>
                    <Text style={styles.resultTitle}>{r.title}</Text>
                    <Text style={styles.resultSub}>{r.subtitle}</Text>
                  </View>
                  <Text style={styles.resultArrow}>›</Text>
                </Pressable>
              ))}

              {!busy && (
                <>
                  <Text style={styles.suggestTitle}>Try saying</Text>
                  <View style={styles.chips}>
                    {suggestionsFor(route).map((s) => (
                      <Pressable key={s} style={styles.chip} onPress={() => submit(s)}>
                        <Text style={styles.chipText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#315C43',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabPressed: { opacity: 0.85 },
  fabIcon: { color: '#FFFFFF', fontSize: 24, marginTop: -2 },

  toast: {
    position: 'absolute',
    top: 14,
    left: 18,
    right: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#173C31',
    elevation: 8,
  },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23, 60, 49, 0.35)' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: '#F8F6F0',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    maxHeight: '78%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF2E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerIconText: { fontSize: 20, color: '#315C43' },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: '#173C31' },
  subtitle: { fontSize: 12, color: '#6A746C', marginTop: 2 },
  close: { fontSize: 28, color: '#6A746C', lineHeight: 30 },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8DDD8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#26352B',
  },
  send: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#315C43', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  sendIcon: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  tip: { fontSize: 11, color: '#8A938C', marginTop: 8 },

  body: { marginTop: 12 },
  working: { fontSize: 13, color: '#4F7757', marginBottom: 10 },
  reply: { backgroundColor: '#EAF2E7', borderRadius: 14, padding: 12, marginBottom: 10 },
  replyWarn: { backgroundColor: '#FFF4E0' },
  replyText: { fontSize: 14, lineHeight: 20, color: '#26352B' },
  replyNote: { fontSize: 11, color: '#6A746C', marginTop: 6 },

  result: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E3D9',
    padding: 12,
    marginBottom: 8,
  },
  resultText: { flex: 1 },
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#29392C' },
  resultSub: { fontSize: 11, color: '#7A817A', marginTop: 2 },
  resultArrow: { fontSize: 22, color: '#829083' },

  suggestTitle: { fontSize: 12, fontWeight: '700', color: '#4F7757', marginTop: 4, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE3DA' },
  chipText: { fontSize: 13, color: '#315C43' },
});
