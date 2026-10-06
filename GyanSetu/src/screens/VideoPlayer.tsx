import { useEventListener } from 'expo';
import { useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer, type VideoPlayer as NativePlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, C, Header, styles as ui } from '@/components/packs/ui';
import { useLocalData } from '@/hooks/useLocalData';
import { addTimeSpent, type LocalVideo } from '@/services/learningPacks';
import { getVideo, recordVideoProgress } from '@/services/videos';
import { selectOnline, useApp } from '@/stores/appStore';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SAVE_EVERY_SEC = 10;

// The player is a native object controlled imperatively (as expo-video intends); these
// helpers keep those writes out of React's render-time immutability analysis.
const seek = (p: NativePlayer, seconds: number) => {
  p.currentTime = seconds;
};
const setRate = (p: NativePlayer, rate: number) => {
  p.playbackRate = rate;
};

/** Plays a saved video offline (or streams an openly licensed one), resuming where the student stopped. */
export default function VideoPlayer() {
  const { id, videoId } = useLocalSearchParams<{ id: string; videoId: string }>();
  const online = useApp(selectOnline);
  const { data: video } = useLocalData(() => getVideo(id, videoId), `${id}/${videoId}`);

  if (video === undefined) return <View style={ui.screen} />;
  const uri = video?.status === 'downloaded' && video.localUri ? video.localUri : online && video && video.source !== 'youtube' ? (video.downloadUrl ?? null) : null;

  return (
    <View style={ui.screen}>
      <Header title={video?.title ?? 'Video'} subtitle={video?.status === 'downloaded' ? 'Playing offline' : 'Streaming'} back={`/packs/${id}`} />
      {!video || !uri ? (
        <View style={ui.content}>
          <Text style={ui.body}>
            {video ? 'This video isn’t saved on your phone. This feature requires an internet connection.' : 'Video not found.'}
          </Text>
          {video && online ? <Button label="Open online" kind="secondary" onPress={() => void Linking.openURL(video.url)} style={s.mt} /> : null}
        </View>
      ) : (
        <Player packId={id} video={video} uri={uri} />
      )}
    </View>
  );
}

function Player({ packId, video, uri }: { packId: string; video: LocalVideo; uri: string }) {
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const position = useRef(video.positionSec);
  const duration = useRef<number | null>(video.durationSec);
  const watchedSinceSave = useRef(0);
  const lastTick = useRef<number | null>(null);
  const resumed = useRef(false);

  const player = useVideoPlayer({ uri }, (p) => {
    p.timeUpdateEventInterval = 1;
    p.play();
  });

  const save = (final = false) => {
    void recordVideoProgress(packId, video, position.current, duration.current);
    if (watchedSinceSave.current >= 5 || (final && watchedSinceSave.current > 0)) {
      void addTimeSpent(packId, video.topicId, watchedSinceSave.current); // watching is studying
      watchedSinceSave.current = 0;
    }
  };

  useEventListener(player, 'statusChange', ({ status, error: e }) => {
    if (status === 'readyToPlay' && !resumed.current) {
      resumed.current = true;
      if (player.duration > 0) duration.current = player.duration;
      // Resume, unless it was finished (then start over).
      if (video.positionSec > 5 && (!duration.current || video.positionSec < duration.current * 0.95)) seek(player, video.positionSec);
    }
    if (status === 'error') {
      setError(e?.message?.match(/format|codec|decoder/i) ? 'This video format isn’t supported on this phone.' : 'This video could not be played.');
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const prev = lastTick.current;
    lastTick.current = currentTime;
    position.current = currentTime;
    // Count only real playback (ticks about a second apart), not seeking.
    if (prev != null && player.playing && currentTime > prev && currentTime - prev <= 2) {
      watchedSinceSave.current += currentTime - prev;
      if (watchedSinceSave.current >= SAVE_EVERY_SEC) save();
    }
  });

  useEventListener(player, 'playToEnd', () => {
    position.current = duration.current ?? position.current;
    save(true);
  });

  // Save on leaving the screen.
  useEffect(() => () => save(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeSpeed = (rate: number) => {
    setRate(player, rate);
    setSpeed(rate);
  };

  return (
    <ScrollView contentContainerStyle={ui.content}>
      <VideoView player={player} style={s.video} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
      {error ? (
        <View style={s.mt}>
          <Text style={ui.error}>{error}</Text>
          <Button label="Open the source page" kind="secondary" onPress={() => void Linking.openURL(video.url)} />
        </View>
      ) : null}
      <Text style={[ui.sectionTitle, s.mt]}>Playback speed</Text>
      <View style={s.speeds}>
        {SPEEDS.map((r) => (
          <Pressable key={r} onPress={() => changeSpeed(r)} style={[s.speed, speed === r && s.speedOn]} accessibilityRole="button">
            <Text style={[s.speedText, speed === r && s.speedTextOn]}>{r}×</Text>
          </Pressable>
        ))}
      </View>
      {video.description ? <Text style={[ui.body, s.mt]}>{video.description}</Text> : null}
      {video.source !== 'user' ? (
        <Text style={[ui.muted, s.mt]}>
          {video.license}
          {video.attribution ? ` · ${video.attribution}` : ''} · {video.source === 'wikimedia' ? 'Wikimedia Commons' : 'YouTube'}
        </Text>
      ) : (
        <Text style={[ui.muted, s.mt]}>Your video — stored only on this phone.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 },
  mt: { marginTop: 14 },
  speeds: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  speed: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder },
  speedOn: { backgroundColor: C.primary, borderColor: C.primary },
  speedText: { fontSize: 13, fontWeight: '700', color: C.primaryDark },
  speedTextOn: { color: '#fff' },
});
