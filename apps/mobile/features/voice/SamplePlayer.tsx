/**
 * SamplePlayer — one-tap audio demo button (V01 A/B demo, V08 preview).
 *
 * Mock media URLs are dead by design (packages/mock ships no binaries), so the
 * failure path is first-class: after a timeout without loaded audio the button
 * flips into an honest "demo ortamında çalınamıyor" note instead of spinning.
 *
 * Tasarım dili: kart yüzeyi + daire içinde oynat düğmesi (Figma ses kartları).
 * Tema duyarlı — gece ekranlarında koyu yüzeyle çalışır.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { PlayIcon, Text, useTheme } from '@kendihikayem/ui';

export function SamplePlayer({
  labelTr,
  sublabelTr,
  url,
}: {
  labelTr: string;
  sublabelTr?: string;
  url: string;
}): ReactNode {
  const { colors, radius, spacing } = useTheme();
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

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  };

  if (failed) {
    return (
      <View style={[cardStyle, { gap: 4 }]}>
        <Text variant="label">{labelTr}</Text>
        <Text variant="caption" tone="muted" style={styles.failedText}>
          Örnek ses bu demo ortamında paketli değil; gerçek sürümde burada 15 saniyelik bir
          dinleme olacak.
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        status.playing ? `${labelTr} — duraklat` : `${labelTr} — örneği dinle`
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        cardStyle,
        { gap: spacing.md },
        pressed && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={[styles.playCircle, { backgroundColor: colors.surfaceRaised }]}>
        {status.playing ? (
          <Text variant="label" style={{ color: colors.primary }} accessibilityElementsHidden>
            ⏸
          </Text>
        ) : (
          <PlayIcon size={18} color={colors.primary} />
        )}
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" style={styles.label}>
          {labelTr}
        </Text>
        {sublabelTr !== undefined && (
          <Text variant="caption" tone="muted">
            {sublabelTr}
          </Text>
        )}
        {attempted && !status.isLoaded && !status.playing && (
          <Text variant="caption" tone="muted">
            Yükleniyor…
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 16, lineHeight: 22 },
  failedText: { fontSize: 13, lineHeight: 18 },
});
