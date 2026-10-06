import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Header, styles as ui } from '@/components/packs/ui';
import { clearLearningHistory } from '@/services/privacy';

/** What GyanSetu stores about your learning, and how to remove it. */
export default function Privacy() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clear = () =>
    Alert.alert(
      'Clear learning history?',
      'This deletes your progress, quiz results, study time, video positions, tutor chats and career guidance — on this phone and on your account. Your downloaded packs stay. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setMessage(null);
            try {
              await clearLearningHistory();
              setMessage('Your learning history was cleared.');
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Could not clear history. Try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <View style={ui.screen}>
      <Header title="Privacy & data" back="/profile" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card>
          <Text style={s.title}>What is stored</Text>
          <Text style={ui.body}>
            • On this phone: your learning packs, progress, quiz results, study time, tutor chats and videos you add.{'\n'}
            • On your account (to sync between phones): progress, quiz results, study time, video positions and tutor chats.{'\n'}
            • Never uploaded: videos you add from your phone.{'\n'}
            • Career guidance uses only your learning activity and the interests/goals you typed — never your category, income, gender or other profile details.
          </Text>
        </Card>

        {message ? <Text style={[ui.body, s.message]}>{message}</Text> : null}
        <View style={s.actions}>
          <Button label="Clear learning history" kind="danger" onPress={clear} busy={busy} />
          <Button label="Delete a learning pack" kind="secondary" onPress={() => router.push('/storage')} />
          <Button label="Delete my account and all data" kind="ghost" onPress={() => router.push('/profile')} />
        </View>
        <Text style={[ui.muted, s.footer]}>
          Your login is stored in the phone’s secure storage. Learning data on the phone is protected by Android/iOS app sandboxing.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  message: { marginBottom: 10 },
  actions: { gap: 10 },
  footer: { marginTop: 14 },
});
