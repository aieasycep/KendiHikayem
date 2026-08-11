/**
 * VoiceRow — Figma "Masalı kim anlatsın?" ses kartı: degrade avatar, ad +
 * "Kişisel" rozeti, açıklama ve satır içi örnek dinleme düğmesi. Tasarımdaki
 * gibi: seçili kartta dinleme düğmesi mor dolguya, simgesi beyaza döner;
 * ayrıca bir onay işareti YOKTUR — seçimi kenarlık + zemin + düğme anlatır.
 *
 * Örnek sesler mock ortamında BİLEREK ölüdür (packages/mock ikili dosya
 * taşımaz); oynatma 4 sn içinde yüklenmezse düğme sessizce pasifleşir —
 * ekran asla dönencede kalmaz.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { demoAudioModule } from '../../lib/demoMedia';

import { PlayIcon, Text, palette, useTheme } from '@kendihikayem/ui';

/** Figma "Kişisel" rozeti: mercan metin, %12 mercan zemin, 6 yarıçap. */
export function PersonalBadge(): ReactNode {
  return (
    <View style={styles.personalBadge}>
      <Text style={styles.personalBadgeText}>KİŞİSEL</Text>
    </View>
  );
}

/** Satır içi örnek dinleme düğmesi — ölü URL'de pasifleşir. */
function PreviewButton({
  url,
  labelTr,
  selected,
}: {
  url: string;
  labelTr: string;
  selected: boolean;
}): ReactNode {
  const { colors } = useTheme();
  /* Demo derlemesinde örnek APK'ya gömülüdür; yoksa uzak adres denenir. */
  const demoModule = demoAudioModule(url);
  const player = useAudioPlayer(demoModule ?? url);
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

  const iconColor = selected ? '#FFFFFF' : colors.inkMuted;

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
        {
          backgroundColor: selected ? colors.primary : colors.surfaceMuted,
          opacity: dead ? 0.35 : 1,
        },
      ]}
    >
      {status.playing ? (
        <Text variant="label" style={{ color: iconColor }} accessibilityElementsHidden>
          ⏸
        </Text>
      ) : (
        <PlayIcon size={12} color={iconColor} />
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
  const { colors, spacing } = useTheme();
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
          backgroundColor: selected
            ? colors.surfaceRaised
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
        selected && styles.rowSelected,
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
          {personal && <PersonalBadge />}
        </View>
        {subtitleTr !== undefined && (
          <Text variant="caption" tone="muted" numberOfLines={2} style={styles.sub}>
            {subtitleTr}
          </Text>
        )}
      </View>
      {sampleUrl !== undefined && (
        <PreviewButton url={sampleUrl} labelTr={titleTr} selected={selected} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Figma ses kartı: 14/18 dolgu · 18 yarıçap · 2 px kenarlık. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  /* Figma: seçili kart gölgesi 0 4 16 rgba(124,92,191,0.15). */
  rowSelected: {
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
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
  name: { flexShrink: 1, fontSize: 15, lineHeight: 20 },
  sub: { fontSize: 13, lineHeight: 18 },

  /* Figma: 10/700, mercan, %12 mercan zemin, 6 yarıçap, 2/8 dolgu. */
  personalBadge: {
    backgroundColor: 'rgba(240, 139, 110, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  /* Figma birebir: #F08B6E metin (tasarım kararı; koyu varyant coral700 değil). */
  personalBadgeText: {
    color: palette.coral,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  /* Figma: 32'lik dinleme dairesi. */
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
