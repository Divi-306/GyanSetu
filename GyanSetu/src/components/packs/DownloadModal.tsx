import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '@/lib/format';
import { usePackDownloads, type DownloadPhase } from '@/services/learningPacks';
import { Button, C, ProgressBar } from './ui';

const PHASE: Record<DownloadPhase, string> = {
  downloading: 'Downloading…',
  verifying: 'Checking the download…',
  saving: 'Saving lessons for offline use…',
};

type Props = {
  visible: boolean;
  packId: string;
  title: string;
  sizeBytes: number | null;
  moduleCount: number;
  error: string | null;
  onDownload: () => void;
  onCancel: () => void;
};

/** "Download Learning Pack?" with size, then live progress while it downloads. */
export function DownloadModal({ visible, packId, title, sizeBytes, moduleCount, error, onDownload, onCancel }: Props) {
  const progress = usePackDownloads((s) => s.active[packId]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={progress ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.icon}>📥</Text>
          <Text style={styles.title}>Download Learning Pack?</Text>
          <Text style={styles.text}>
            <Text style={styles.bold}>{title}</Text> will be saved on this phone so you can learn — and use the AI tutor — without an
            internet connection.
          </Text>
          <Text style={styles.meta}>
            {moduleCount} modules · Size: {sizeBytes ? formatBytes(sizeBytes) : 'about 1 MB'}
          </Text>

          {progress ? (
            <View style={styles.progress}>
              <Text style={styles.phase}>{PHASE[progress.phase]}</Text>
              <ProgressBar value={progress.progress} />
              <Text style={styles.percent}>{Math.round(progress.progress * 100)}%</Text>
            </View>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                <Button label="Cancel" kind="secondary" onPress={onCancel} style={styles.flex} />
                <Button label={error ? 'Try again' : 'Download'} onPress={onDownload} style={styles.flex} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,24,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 20, padding: 22 },
  icon: { fontSize: 34, textAlign: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 6 },
  text: { fontSize: 14, lineHeight: 21, color: C.body, textAlign: 'center', marginTop: 10 },
  bold: { fontWeight: '700', color: C.text },
  meta: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 10, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  progress: { gap: 8 },
  phase: { fontSize: 13, color: C.body, fontWeight: '600' },
  percent: { fontSize: 12, color: C.muted, textAlign: 'right' },
  error: { color: C.red, fontSize: 13, textAlign: 'center', marginBottom: 12, lineHeight: 19 },
});
