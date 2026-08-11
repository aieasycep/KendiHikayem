/**
 * SamplePlayer — one-tap audio demo button (V01 A/B demo, V08 preview).
 *
 * Mock media URLs are dead by design (packages/mock ships no binaries), so the
 * failure path is first-class: after a timeout without loaded audio the button
 * flips into an honest "demo ortamında çalınamıyor" note instead of spinning.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { colors, radius, spacing, typography } from '../../constants/theme';

export function SamplePlayer({
  labelTr,
  sublabelTr,
  url,
}: {
  labelTr: string;
  sublabelTr?: string;
  url: string;
}): ReactNode {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const failTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (failTimer.current !== undefined) clearTimeout(failTimer.current);
    };
  }, []);

  useEffect(() => {
    if (status.isLoaded && failTimer.current !== undefined) {
      clearTimeout(failTimer.current);
      failTimer.current = undefined;
    }
  }, [status.isLoaded]);

  const onPress = (): void => {
    setAttempted(true);
    if (status.playing) {
      player.pause();
      return;
    }
    try {
      player.seekTo(0).catch(() => {
        /* seeking an unloaded source may reject — play() below still tries */
      });
      player.play();
    } catch {
      setFailed(true);
      return;
    }
    if (!status.isLoaded && failTimer.current === undefined) {
      failTimer.current = setTimeout(() => {
        setFailed(true);
      }, 4_000);
    }
  };

  if (failed) {
    return (
      <View style={[styles.button, styles.failedBox]}>
        <Text style={styles.failedTitle}>{labelTr}</Text>
        <Text style={styles.failedText}>
          Örnek ses bu demo ortamında paketli değil; gerçek sürümde burada 15 saniyelik bir
          dinleme olacak.
        </Text>
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.icon}>{status.playing ? '⏸' : '▶'}</Text>
      <View style={styles.body}>
        <Text style={styles.label}>{labelTr}</Text>
        {sublabelTr !== undefined && <Text style={styles.sublabel}>{sublabelTr}</Text>}
        {attempted && !status.isLoaded && !status.playing && (
          <Text style={styles.sublabel}>Yükleniyor…</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  icon: { fontSize: 24, color: colors.primary },
  body: { flex: 1, gap: 2 },
  label: { ...typography.body, fontWeight: '700', color: colors.ink },
  sublabel: { ...typography.caption, color: colors.inkMuted },

  failedBox: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  failedTitle: { ...typography.label, color: colors.ink },
  failedText: { ...typography.caption, fontSize: 13, lineHeight: 18, color: colors.inkMuted },
});
