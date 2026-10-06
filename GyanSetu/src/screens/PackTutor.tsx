import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Markdown } from '@/components/Markdown';
import { C, ConnectionPill, Header, styles as ui } from '@/components/packs/ui';
import { ApiError, NetworkError, errorMessage } from '@/lib/api';
import {
  appendChat,
  askOnlineTutor,
  clearChat,
  createTutorStore,
  loadChat,
  loadTutorData,
  type ChatMessage,
} from '@/services/learningPacks';
import { selectOnline, useApp } from '@/stores/appStore';
import { OfflineTutor } from '@/tutor/engine';
import type { TutorReply } from '@/tutor/types';

export default function PackTutor() {
  // q: a request handed over from another screen ("Quiz me on this"), sent once.
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const online = useApp(selectOnline);
  const authed = useApp((s) => s.sessionStatus === 'authed');
  const useOnline = online && authed;
  const [tutor, setTutor] = useState<OfflineTutor | null>(null);
  const [title, setTitle] = useState('AI Tutor');
  const [missing, setMissing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sentInitial = useRef(false);

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadTutorData(id);
      if (cancelled) return;
      if (!data) {
        setMissing(true);
        return;
      }
      const engine = new OfflineTutor(data, createTutorStore(id));
      setTitle(data.title);
      let history = await loadChat(id);
      if (history.length === 0) {
        const hello = await engine.greet();
        history = [await appendChat(id, 'tutor', hello.text, { mode: 'offline', quickReplies: hello.quickReplies, grounded: true }, { sync: false })];
      }
      if (cancelled) return;
      setMessages(history);
      setTutor(engine);
      scrollDown();
    })().catch((err) => console.warn('[tutor] load', err));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const offlineReply = async (engine: OfflineTutor, text: string) => {
    const r: TutorReply = await engine.reply(text);
    return appendChat(id, 'tutor', r.text, { mode: 'offline', quickReplies: r.quickReplies, sources: r.sources, grounded: r.grounded });
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking || !tutor) return;
    setInput('');
    const userMsg = await appendChat(id, 'user', text);
    setMessages((m) => [...m, userMsg]);
    setThinking(true);
    scrollDown();
    let answer: ChatMessage;
    try {
      if (useOnline && (await tutor.isOpenQuestion(text))) {
        try {
          const history = [...messages, userMsg].slice(-7, -1).map((m) => ({ role: m.role, text: m.text }));
          const r = await askOnlineTutor(id, text, history);
          answer = await appendChat(id, 'tutor', r.answer, {
            mode: 'online',
            quickReplies: r.suggestedFollowUps,
            sources: r.topics.map((t) => t.title),
            grounded: r.groundedInPack,
          });
        } catch (err) {
          // Rate limits are the student's to see; anything else → the offline tutor answers.
          if (err instanceof ApiError && err.status === 429) throw err;
          if (!(err instanceof NetworkError) && !(err instanceof ApiError)) throw err;
          answer = await offlineReply(tutor, text);
        }
      } else {
        answer = await offlineReply(tutor, text);
      }
    } catch (err) {
      answer = await appendChat(id, 'tutor', errorMessage(err), { mode: 'offline', grounded: false }, { sync: false });
    } finally {
      setThinking(false);
    }
    setMessages((m) => [...m, answer]);
    scrollDown();
  };

  useEffect(() => {
    if (!q || !tutor || sentInitial.current) return;
    sentInitial.current = true;
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tutor]);

  const reset = async () => {
    await clearChat(id);
    setMessages([]);
    if (tutor) {
      const hello = await tutor.greet();
      setMessages([await appendChat(id, 'tutor', hello.text, { mode: 'offline', quickReplies: hello.quickReplies, grounded: true }, { sync: false })]);
    }
  };

  const last = messages[messages.length - 1];

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header
        title={title}
        subtitle={useOnline ? 'Online tutor · uses your pack' : 'Offline tutor · teaches only from your pack'}
        back={`/packs/${id}`}
        right={
          <View style={s.headerRight}>
            <ConnectionPill />
            <Pressable onPress={reset} hitSlop={8} accessibilityLabel="New conversation">
              <Text style={s.reset}>↺</Text>
            </Pressable>
          </View>
        }
      />

      {missing ? (
        <View style={ui.content}>
          <Text style={ui.muted}>This pack isn’t on your phone. Download it to use the tutor offline.</Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={s.chat} contentContainerStyle={s.chatContent} keyboardShouldPersistTaps="handled">
          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={[s.bubble, s.user]}>
                <Text style={s.userText}>{m.text}</Text>
              </View>
            ) : (
              <View key={m.id} style={[s.bubble, s.tutor, m.meta?.grounded === false && s.ungrounded]}>
                <Markdown source={m.text} />
                <Text style={s.meta}>
                  {m.meta?.mode === 'online' ? '🌐 Online' : '📦 Offline'}
                  {m.meta?.sources?.length ? ` · ${m.meta.sources.slice(0, 2).join(', ')}` : ''}
                  {m.meta?.mode === 'online' && m.meta.grounded === false ? ' · general knowledge, not from your pack' : ''}
                </Text>
              </View>
            ),
          )}
          {thinking ? (
            <View style={[s.bubble, s.tutor]}>
              <Text style={ui.muted}>Thinking…</Text>
            </View>
          ) : null}
          {!thinking && last?.role === 'tutor' && last.meta?.quickReplies?.length ? (
            <View style={s.quick}>
              {last.meta.quickReplies.map((r) => (
                <Pressable key={r} style={s.quickChip} onPress={() => send(r)}>
                  <Text style={s.quickText}>{r}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <View style={s.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={useOnline ? 'Ask anything, or "quiz me"…' : 'Ask from your pack, or "take my viva"…'}
          placeholderTextColor="#98A29A"
          style={s.input}
          multiline
          editable={!missing}
        />
        <Pressable style={[s.send, (!input.trim() || thinking) && s.sendOff]} disabled={!input.trim() || thinking} onPress={() => send()}>
          <Text style={s.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reset: { fontSize: 22, color: C.primaryDark },
  chat: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 24 },
  bubble: { borderRadius: 16, padding: 12, marginBottom: 10, maxWidth: '92%' },
  user: { alignSelf: 'flex-end', backgroundColor: C.primary },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  tutor: { alignSelf: 'flex-start', backgroundColor: C.card, borderWidth: 1, borderColor: '#ECEFE8' },
  ungrounded: { borderColor: '#EED9B0', backgroundColor: '#FFFBF2' },
  meta: { fontSize: 11, color: C.muted, marginTop: 2 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder },
  quickText: { fontSize: 13, color: C.primaryDark, fontWeight: '600' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#ECEFE8', backgroundColor: C.bg },
  input: {
    flex: 1, maxHeight: 120, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDE4D9', fontSize: 15, color: C.text,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
