import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { goBackOr } from '@/lib/nav';
import { askTutor } from '@/services/ai';
import { selectOnline, useApp } from '@/stores/appStore';

type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  source?: string;
  confidence?: 'High' | 'Medium' | 'Low';
  mode?: 'online' | 'offline';
};

const suggestedQuestions = [
  'What is the difference between a list and a tuple?',
  'What is a primary key?',
  'Explain the OSI model.',
];

const CONFIDENCE = { high: 'High', medium: 'Medium', low: 'Low' } as const;

export default function AI() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const online = useApp(selectOnline);
  const authed = useApp((st) => st.sessionStatus === 'authed');
  const useOnlineAi = online && authed;
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      text:
        'Hi! I am GyanSetu AI. I can answer questions using your downloaded learning material, even when you are offline.',
    },
  ]);

  const askQuestion = async (question?: string) => {
    const finalQuestion = (question ?? input).trim();

    if (!finalQuestion || thinking) return;
    if (finalQuestion.length < 3) return;

    setMessages((previous) => [
      ...previous,
      { id: `user-${Crypto.randomUUID()}`, role: 'user', text: finalQuestion },
    ]);
    setInput('');
    setThinking(true);

    let aiMessage: Message;
    try {
      const answer = await askTutor(finalQuestion, { online: useOnlineAi, courseId });
      aiMessage = {
        id: `ai-${Crypto.randomUUID()}`,
        role: 'ai',
        text: answer.answer,
        source: answer.sources.length
          ? answer.sources.map((src) => src.label).join('\n')
          : answer.mode === 'online'
            ? 'General knowledge (not from your course material)'
            : 'Downloaded material',
        confidence: CONFIDENCE[answer.confidence],
        mode: answer.mode,
      };
    } catch (err) {
      aiMessage = { id: `ai-${Crypto.randomUUID()}`, role: 'ai', text: errorMessage(err) };
    } finally {
      setThinking(false);
    }

    setMessages((previous) => [...previous, aiMessage]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios' ? 'padding' : undefined
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => goBackOr('/dashboard')}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerInfo}>
          <View style={styles.aiIcon}>
            <Text style={styles.aiEmoji}>🤖</Text>
          </View>

          <View>
            <Text style={styles.headerTitle}>
              GyanSetu AI
            </Text>

            <View style={styles.statusRow}>
              <View style={styles.statusDot} />

              <Text style={styles.statusText}>
                {useOnlineAi ? 'Online tutor' : 'Offline learning assistant'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Offline information */}
      <View style={styles.offlineBanner}>
        <Text style={styles.offlineTitle}>
          {useOnlineAi ? '🌐 Online Mode' : '🟢 Offline Mode'}
        </Text>

        <Text style={styles.offlineDescription}>
          {useOnlineAi
            ? 'Answers come from the GyanSetu tutor, using your course material where it can. Every answer shows its source.'
            : online
              ? 'Answers come from your downloaded material. Log in to ask the online tutor.'
              : 'Answers are based only on your downloaded learning material.'}
        </Text>
      </View>

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Intro */}
        {messages.length === 1 && (
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>
              Ask anything from your lessons
            </Text>

            <Text style={styles.introDescription}>
              GyanSetu searches your stored notes,
              lectures and course material before
              answering.
            </Text>

            <Text style={styles.introNote}>
              {useOnlineAi ? 'Online now. Works offline too.' : 'No internet required.'}
            </Text>
          </View>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';

          return (
            <View
              key={message.id}
              style={[
                styles.messageWrapper,
                isUser
                  ? styles.userWrapper
                  : styles.aiWrapper,
              ]}
            >
              {!isUser && (
                <View style={styles.smallAIIcon}>
                  <Text>🤖</Text>
                </View>
              )}

              <View
                style={[
                  styles.messageBubble,
                  isUser
                    ? styles.userBubble
                    : styles.aiBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isUser
                      ? styles.userMessageText
                      : styles.aiMessageText,
                  ]}
                >
                  {message.text}
                </Text>

                {!isUser && message.source && (
                  <View style={styles.sourceCard}>
                    <Text style={styles.sourceLabel}>
                      {message.mode === 'online' ? 'SOURCE • ONLINE' : 'SOURCE • OFFLINE'}
                    </Text>

                    <Text style={styles.sourceText}>
                      {message.source}
                    </Text>

                    <View style={styles.confidenceRow}>
                      <Text style={styles.confidenceLabel}>
                        Confidence
                      </Text>

                      <View
                        style={[
                          styles.confidenceBadge,
                          message.confidence ===
                            'High'
                            ? styles.highConfidence
                            : styles.lowConfidence,
                        ]}
                      >
                        <Text
                          style={
                            styles.confidenceText
                          }
                        >
                          {message.confidence}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {thinking && (
          <View style={[styles.messageWrapper, styles.aiWrapper]}>
            <View style={styles.smallAIIcon}>
              <Text>🤖</Text>
            </View>
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <Text style={[styles.messageText, styles.aiMessageText]}>Thinking…</Text>
            </View>
          </View>
        )}

        {/* Suggested Questions */}
        <Text style={styles.suggestedTitle}>
          Try asking
        </Text>

        {suggestedQuestions.map((question) => (
          <Pressable
            key={question}
            style={styles.suggestion}
            onPress={() => askQuestion(question)}
          >
            <Text style={styles.suggestionText}>
              {question}
            </Text>

            <Text style={styles.suggestionArrow}>
              →
            </Text>
          </Pressable>
        ))}

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Input */}
      <View style={styles.inputArea}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask something from your lessons..."
          placeholderTextColor="#89938C"
          multiline
          style={styles.input}
          onSubmitEditing={() => askQuestion()}
        />

        <Pressable
          style={[
            styles.sendButton,
            !input.trim() && styles.disabledSend,
          ]}
          disabled={!input.trim() || thinking}
          onPress={() => askQuestion()}
        >
          <Text style={styles.sendIcon}>
            ↑
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  header: {
    paddingTop: 25,
    paddingHorizontal: 20,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E3E7E1',
    backgroundColor: '#F8F6F0',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF1E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backText: {
    fontSize: 30,
    color: '#365C48',
    marginTop: -3,
  },

  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E8F2EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  aiEmoji: {
    fontSize: 23,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#173C31',
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3B8D5A',
    marginRight: 5,
  },

  statusText: {
    fontSize: 10,
    color: '#6D7971',
  },

  offlineBanner: {
    marginHorizontal: 20,
    marginTop: 13,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#EAF3E9',
    borderWidth: 1,
    borderColor: '#D3E4D1',
  },

  offlineTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#31583D',
  },

  offlineDescription: {
    fontSize: 10,
    lineHeight: 15,
    color: '#68766D',
    marginTop: 3,
  },

  chat: {
    flex: 1,
  },

  chatContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
  },

  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E7E0',
    marginBottom: 18,
  },

  introTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#294B39',
  },

  introDescription: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 17,
    color: '#737A74',
  },

  introNote: {
    marginTop: 9,
    fontSize: 10,
    fontWeight: '600',
    color: '#568061',
  },

  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 15,
  },

  userWrapper: {
    justifyContent: 'flex-end',
  },

  aiWrapper: {
    justifyContent: 'flex-start',
  },

  smallAIIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#E6F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 3,
  },

  messageBubble: {
    maxWidth: '84%',
    padding: 14,
    borderRadius: 17,
  },

  userBubble: {
    backgroundColor: '#5F8068',
    borderBottomRightRadius: 5,
  },

  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E6DF',
    borderBottomLeftRadius: 5,
  },

  messageText: {
    fontSize: 13,
    lineHeight: 20,
  },

  userMessageText: {
    color: '#FFFFFF',
  },

  aiMessageText: {
    color: '#3F4F46',
  },

  sourceCard: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E9E4',
  },

  sourceLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#8A958E',
  },

  sourceText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: '#53645A',
  },

  confidenceRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  confidenceLabel: {
    fontSize: 9,
    color: '#7D8881',
  },

  confidenceBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },

  highConfidence: {
    backgroundColor: '#E2F1E4',
  },

  lowConfidence: {
    backgroundColor: '#F5EBD9',
  },

  confidenceText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#52715B',
  },

  suggestedTitle: {
    marginTop: 8,
    marginBottom: 9,
    fontSize: 12,
    fontWeight: '700',
    color: '#69756D',
  },

  suggestion: {
    minHeight: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E0E6DE',
    paddingHorizontal: 13,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  suggestionText: {
    flex: 1,
    fontSize: 11,
    color: '#526158',
  },

  suggestionArrow: {
    fontSize: 17,
    color: '#66806D',
  },

  bottomSpace: {
    height: 15,
  },

  inputArea: {
    minHeight: 70,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E6E1',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  input: {
    flex: 1,
    minHeight: 47,
    maxHeight: 100,
    backgroundColor: '#F3F5F1',
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 12,
    color: '#35463C',
    marginRight: 9,
  },

  sendButton: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: '#5F8068',
    alignItems: 'center',
    justifyContent: 'center',
  },

  disabledSend: {
    opacity: 0.4,
  },

  sendIcon: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
  },
});