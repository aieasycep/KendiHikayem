/**
 * VoiceRow — Figma "Masalı kim anlatsın?" ses kartı: degrade avatar, ad +
 * "Kişisel" rozeti, açıklama ve satır içi örnek dinleme düğmesi.
 *
 * Örnek sesler mock ortamında BİLEREK ölüdür (packages/mock ikili dosya
 * taşımaz); oynatma 4 sn içinde yüklenmezse düğme sessizce pasifleşir —
 * ekran asla dönencede kalmaz.
 *
 * packages/ui'ye TERFİ ADAYI: VoiceRow (Card/Voice/Parent + Card/Voice/System).
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { Badge, PlayIcon, Text, palette, useTheme } from '@kendihikayem/ui';

import { SelectedCheck } from '../onboarding/components';

/** Satır içi örnek dinleme düğmesi — ölü URL'de pasifleşir. */
function PreviewButton({ url, labelTr }: { url: string; labelTr: string }): ReactNode {
  const { colors } = useTheme();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [dead, setDead] = useState(false);
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
    if (dead) return;
    if (status.playing) {
      player.pause();
      return;
    }
    try {
      player.seekTo(0).catch(() => {
        /* unloaded seek may reject — play() below still tries */
      });
      player.play();
    } catch {
      setDead(true);
      return;
    }
    if (!status.isLoaded && failTimer.current === undefined) {
      failTimer.current = setTimeout(() => {
        setDead(true);
      }, 4_000);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        dead
          ? `${labelTr} — örnek ses bu ortamda paketli değil`
          : status.playing
            ? `${labelTr} — örneği duraklat`
            : `${labelTr} — örneği dinle`
      }
      accessibilityState={{ disabled: dead }}
      disabled={dead}
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.playCircle,
        { backgroundColor: colors.surfaceMuted, opacity: dead ? 0.35 : 1 },
      ]}
    >
      {status.playing ? (
        <Text variant="label" style={{ color: colors.primary }} accessibilityElementsHidden>
          ⏸
        </Text>
      ) : (
        <PlayIcon size={16} color={colors.primary} />
      )}
    </Pressable>
  );
}

export function VoiceRow({
  titleTr,
  subtitleTr,
  personal,
  emoji,
  selected,
  onPress,
  sampleUrl,
}: {
  titleTr: string;
  subtitleTr?: string;
  /** Klonlanmış ebeveyn sesi mi (turuncu avatar + "Kişisel" rozeti)? */
  personal: boolean;
  emoji: string;
  selected: boolean;
  onPress: () => void;
  sampleUrl?: string;
}): ReactNode {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        subtitleTr !== undefined ? `${titleTr}. ${subtitleTr}` : titleTr
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: selected
            ? colors.surfaceRaised
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <LinearGradient
        colors={personal ? [palette.peach, palette.coral] : [palette.lavenderPale, palette.lavender]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatar}
      >
        <Text style={styles.avatarEmoji} accessibilityElementsHidden>
          {emoji}
        </Text>
      </LinearGradient>
      <View style={styles.body}>
        <View style={[styles.nameRow, { gap: spacing.sm }]}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {titleTr}
          </Text>
          {personal && <Badge labelTr="Kişisel" tone="accent" />}
        </View>
        {subtitleTr !== undefined && (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitleTr}
          </Text>
        )}
      </View>
      {sampleUrl !== undefined ? (
        <PreviewButton url={sampleUrl} labelTr={titleTr} />
      ) : selected ? (
        <SelectedCheck />
      ) : null}
      {sampleUrl !== undefined && selected && <SelectedCheck />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },
  body: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flexShrink: 1 },
  playCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
