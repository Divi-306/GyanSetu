import React from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalData } from '@/hooks/useLocalData';
import { formatBytes } from '@/lib/format';
import { deletePack } from '@/services/learningPacks';
import { dismissNotice, exportPackProgress, getNotices, keepPack, restorePack } from '@/services/storage';
import { Button, C } from './ui';

/**
 * Storage notices from automatic maintenance:
 * - after 7 days unused, optional data was compressed → [Keep Optimized] [Restore Full Pack]
 * - after 30 days unused → ask: [Delete] [Keep Pack] (+ export progress). Never deleted silently.
 */
export function StorageNotices() {
  const { data: notices } = useLocalData(getNotices);
  if (!notices?.length) return null;

  return (
    <View>
      {notices.map((n) =>
        n.kind === 'optimized' ? (
          <View key={n.id} style={s.card}>
            <Text style={s.text}>
              Your <Text style={s.bold}>{n.title}</Text> learning pack hasn’t been used for 7 days. We compressed unused content to save{' '}
              {formatBytes(n.bytesSaved)} of storage.
            </Text>
            <View style={s.row}>
              <Button label="Keep Optimized" kind="secondary" onPress={() => void dismissNotice(n.id)} style={s.flex} />
              <Button
                label="Restore Full Pack"
                onPress={async () => {
                  const r = await restorePack(n.packId);
                  await dismissNotice(n.id);
                  if (r.videosPending) Alert.alert('Restored', `${r.videosPending} video(s) will download when you're online.`);
                }}
                style={s.flex}
              />
            </View>
          </View>
        ) : (
          <View key={n.id} style={[s.card, s.warn]}>
            <Text style={s.text}>
              Your <Text style={s.bold}>{n.title}</Text> learning pack hasn’t been used for {n.days} days. It is using {formatBytes(n.bytes)} of storage. Would you like to delete it?
            </Text>
            <View style={s.row}>
              <Button label="Keep Pack" kind="secondary" onPress={() => void keepPack(n.packId)} style={s.flex} />
              <Button
                label="Delete"
                kind="danger"
                onPress={() =>
                  Alert.alert(`Delete ${n.title}?`, 'Your progress is kept on your account and comes back if you download it again.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        await deletePack(n.packId);
                        await dismissNotice(n.id);
                      },
                    },
                  ])
                }
                style={s.flex}
              />
            </View>
            <Button label="Export / back up progress" kind="ghost" onPress={async () => void Share.share({ title: n.title, message: await exportPackProgress(n.packId) })} />
          </View>
        ),
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.soft, borderColor: C.softBorder, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  warn: { backgroundColor: C.amberSoft, borderColor: '#EED9B0' },
  text: { fontSize: 14, lineHeight: 21, color: C.body },
  bold: { fontWeight: '700', color: C.text },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  flex: { flex: 1 },
});
