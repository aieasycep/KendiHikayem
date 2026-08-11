/**
 * PlayerScreen — P01 oynatıcı, Figma `AudioPlayer.tsx` birebir taşıması.
 *
 * Tasarımın düzeni: gece zemininde parlama + yıldız alanı, üstte geri / "ŞİMDİ
 * DİNLİYORSUN" / ⋯ başlığı, ortada 220×220 kapak karosu, altında başlık ve
 * "🎙 ses" satırı, dalga formu, ilerleme çubuğu, 15 sn geri – oynat/duraklat –
 * 15 sn ileri kontrolleri, hız çipleri (0.8x/1x/1.2x) + Zamanlayıcı ve
 * "Metni göster" düğmesi.
 *
 * İŞLEV (görünmez altyapı) KORUNDU:
 *  - Karaoke motoru: "Metni göster" (tasarımın kendi düğmesi) metin panelini
 *    açar; kelime vurgusu orada akar.
 *  - Uyku modu: tasarımdaki "Zamanlayıcı" çipi uyku modunu açar/kapar; ekran
 *    yavaşça kararır, ses ve tempo yumuşar, masal bitince kendiliğinden durur.
 *  - Ses yüklenemezse SESSİZ OKUMA moduna düşer; metin paneli otomatik açılır.
 *  - Konum kaydı, kaldığı yerden devam, otomatik sayfa çevirme sürer.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type { PlayerManifest } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  PlayIcon,
  Sheet,
  Text,
  ThemeScope,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { bedtimeDim, bedtimeRate, bedtimeVolume, canWordHighlight } from './karaoke';
import { usePlayerEngine } from './engine';
import { useKaraoke } from './useKaraoke';
import { KaraokeText } from './KaraokeText';
import { NightCover } from './NightCover';
import {
  ClockIcon,
  FileTextIcon,
  MoreVerticalIcon,
  PauseIcon,
  Skip15BackIcon,
  Skip15ForwardIcon,
} from './icons';
import { useSaveProgress } from './hooks';
import { ArrowLeftIcon } from '../library/icons';
import { useStory, useToggleFavorite } from '../library/hooks';
import { offlineAudio, offlinePageImage, type OfflineStoryMeta } from '../library/offline';

/** "3:24" biçimli süre — tasarımdaki geçen/kalan süre satırı. */
function fmtClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Tasarımdaki hız seçenekleri — Figma `AudioPlayer` "0.8x / 1x / 1.2x". */
const SPEED_OPTIONS = [
  { labelTr: '0.8x', rate: 0.8 },
  { labelTr: '1x', rate: 1 },
  { labelTr: '1.2x', rate: 1.2 },
] as const;

/** Tasarımdaki deterministik yıldız alanı (24 nokta) — her render aynı gökyüzü. */
const STARS = Array.from({ length: 24 }, (_, i) => ({
  size: i % 4 === 0 ? 3 : 2,
  opacity: 0.15 + (i % 5) * 0.08,
  top: `${(i * 41 + 5) % 100}%` as const,
  left: `${(i * 67 + 9) % 100}%` as const,
}));

/** Tasarımdaki dalga formu: 28 çubuk, 8 + sin(i·0.8)·12 + 4 yüksekliği. */
const WAVE_BAR_COUNT = 28;
const WAVE_HEIGHTS = Array.from({ length: WAVE_BAR_COUNT }, (_, i) =>
  Math.max(0, 8 + Math.sin(i * 0.8) * 12 + 4),
);

/** Arka plan parlaması — tasarımdaki radial-gradient daireleri. */
function Glow({ size, color, opacity }: { size: number; color: string; opacity: number }): ReactElement {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
          <Stop offset="70%" stopColor={color} stopOpacity={0} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#glow)" />
    </Svg>
  );
}

export interface PlayerScreenProps {
  storyId: string;
  manifest: PlayerManifest;
  /** İndirilmişse yerel varlıklar buradan çözülür. */
  offlineMeta?: OfflineStoryMeta;
  /** Manifest ağdan değil diskten/sessiz üretimden geldiyse true (rozet gösterilir). */
  silentFallback?: boolean;
  /** A06 tercihinden: vurgu varsayılanı (yoksa manifest.wordHighlightDefault). */
  highlightDefault?: boolean;
  autoPageTurnDefault?: boolean;
  bedtimeEnabledDefault?: boolean;
}

function PlayerInner({
  storyId,
  manifest,
  offlineMeta,
  silentFallback = false,
  highlightDefault,
  autoPageTurnDefault,
  bedtimeEnabledDefault,
}: PlayerScreenProps): ReactElement {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, motion, radius, spacing } = useTheme();

  /* Sekme çubuğunu gizle: yatma saatinde ekranda yalnızca masal olsun. */
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      parent?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

  const [highlightOn, setHighlightOn] = useState(
    highlightDefault ?? manifest.wordHighlightDefault,
  );
  const [autoPageTurn, setAutoPageTurn] = useState(autoPageTurnDefault ?? true);
  const [bedtimeOn, setBedtimeOn] = useState(
    bedtimeEnabledDefault ?? manifest.bedtimeMode.enabled,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  /** Tasarımdaki "Metni göster" — sessiz düşüşte otomatik açık (okunabilsin). */
  const [showText, setShowText] = useState(silentFallback);
  /** Kullanıcının hız seçimi — uyku modu eğrisiyle ÇARPILIR, onu ezmez. */
  const [userRate, setUserRate] = useState(1);

  const saveProgress = useSaveProgress();
  /* Favori durumu — ⋯ menüsünden erişilir (kitaplıktaki Favoriler sekmesini besler). */
  const storyQuery = useStory(storyId);
  const toggleFavorite = useToggleFavorite();

  const highlightPossible =
    canWordHighlight(manifest) || manifest.pages.some((p) => p.sentences.length > 0);

  const audioUri = offlineAudio(offlineMeta) ?? (silentFallback ? undefined : manifest.audio.url);

  const engine = usePlayerEngine({
    audioUri,
    totalDurationMs: manifest.totalDurationMs,
    onEnded: () => {
      setFinished(true);
    },
  });

  const karaoke = useKaraoke(manifest, engine, {
    highlightEnabled: highlightOn && highlightPossible,
  });

  const pages = manifest.pages;
  const page = pages[Math.min(karaoke.pageIndex, pages.length - 1)];
  const pageCount = pages.length;

  /* Kaldığı yerden devam — yalnızca ilk açılışta. */
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const resume = manifest.resume;
    if (resume !== undefined && resume.positionMs > 2_000) {
      engine.seekTo(resume.positionMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  /* Otomatik sayfa çevirme KAPALIYSA sayfa sonunda dur. */
  const lastPageIndexRef = useRef(0);
  useEffect(() => {
    const previous = lastPageIndexRef.current;
    if (karaoke.pageIndex !== previous) {
      lastPageIndexRef.current = karaoke.pageIndex;
      if (!autoPageTurn && karaoke.pageIndex > previous && engine.playing) {
        const previousPage = pages[previous];
        engine.pause();
        if (previousPage !== undefined) engine.seekTo(Math.max(0, previousPage.endMs - 80));
        lastPageIndexRef.current = previous;
        return;
      }
      /* Sayfa değişti → konumu kaydet (L01 devam verisi buradan beslenir). */
      const current = pages[karaoke.pageIndex];
      if (current !== undefined) {
        saveProgress.mutate({
          storyId,
          pageNo: current.pageNo,
          positionMs: karaoke.positionMs,
          renditionId: silentFallback ? undefined : (manifest.renditionId as string),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karaoke.pageIndex, autoPageTurn, engine.playing]);

  /* Uyku modu: ses, tempo ve karartma sayfaya göre. */
  const dimTarget = useMemo(() => {
    if (!bedtimeOn || page === undefined) return 0;
    const input = {
      pageNo: page.pageNo,
      totalPages: pageCount,
      fadeStartsAtPage: manifest.bedtimeMode.fadeStartsAtPage,
      targetEndVolume: manifest.bedtimeMode.targetEndVolume,
    };
    return bedtimeDim(input);
  }, [bedtimeOn, page, pageCount, manifest.bedtimeMode]);

  useEffect(() => {
    if (page === undefined) return;
    if (!bedtimeOn) {
      engine.setVolume(1);
      engine.setRate(userRate);
      return;
    }
    const input = {
      pageNo: page.pageNo,
      totalPages: pageCount,
      fadeStartsAtPage: manifest.bedtimeMode.fadeStartsAtPage,
      targetEndVolume: manifest.bedtimeMode.targetEndVolume,
    };
    engine.setVolume(bedtimeVolume(input));
    // Uyku eğrisi korunur; kullanıcı hızı eğriyle çarpılır.
    engine.setRate(bedtimeRate(input) * userRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedtimeOn, karaoke.pageIndex, userRate]);

  const [dimAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(dimAnim, {
      toValue: dimTarget,
      duration: motion.drowsy,
      useNativeDriver: true,
    }).start();
  }, [dimTarget, dimAnim, motion.drowsy]);

  /* Kapak karosu "float" animasyonu — tasarımda yalnızca çalarken. */
  const [floatAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (engine.playing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(floatAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
      };
    }
    floatAnim.setValue(0);
    return undefined;
  }, [engine.playing, floatAnim]);
  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  /* Bitiş: konumu tamamlandı olarak yaz. */
  useEffect(() => {
    if (!finished || page === undefined) return;
    saveProgress.mutate({
      storyId,
      pageNo: page.pageNo,
      positionMs: manifest.totalDurationMs,
      renditionId: silentFallback ? undefined : (manifest.renditionId as string),
      completed: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* Ekrandan çıkarken son konumu kaydet. */
  const exitStateRef = useRef({ pageNo: 1, positionMs: 0 });
  useEffect(() => {
    if (page !== undefined) {
      exitStateRef.current = { pageNo: page.pageNo, positionMs: karaoke.positionMs };
    }
  }, [page, karaoke.positionMs]);
  useEffect(() => {
    return () => {
      const { pageNo, positionMs } = exitStateRef.current;
      if (positionMs > 1_000) {
        saveProgress.mutate({ storyId, pageNo, positionMs });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 15 sn atlama — tasarımın atlama düğmeleri. */
  const skipBy = useCallback(
    (deltaMs: number): void => {
      setFinished(false);
      engine.seekTo(engine.readPositionMs() + deltaMs);
    },
    [engine],
  );

  /* İlerleme çubuğuna dokunarak konum atla. */
  const trackWidthRef = useRef(0);
  const onTrackLayout = useCallback((event: LayoutChangeEvent): void => {
    trackWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  if (page === undefined) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]}>
        <Text variant="body" tone="muted" center>
          Bu masalın sayfaları henüz hazır değil.
        </Text>
      </View>
    );
  }

  const overallProgress =
    manifest.totalDurationMs > 0 ? karaoke.positionMs / manifest.totalDurationMs : 0;
  const clamped = Math.max(0, Math.min(1, overallProgress));
  const remainingMs = Math.max(0, manifest.totalDurationMs - karaoke.positionMs);
  const isFavorite = storyQuery.data?.isFavorite === true;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* ── Arka plan parlamaları (tasarım: radial-gradient) ── */}
      <View pointerEvents="none" style={styles.glowTop}>
        <Glow size={400} color={palette.purple600} opacity={0.2} />
      </View>
      <View pointerEvents="none" style={styles.glowBottom}>
        <Glow size={260} color={palette.nightBlue} opacity={0.15} />
      </View>

      {/* ── Yıldızlar ── */}
      {STARS.map((star, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.star,
            {
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              top: star.top,
              left: star.left,
            },
          ]}
        />
      ))}

      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.content}>
        {/* ── Başlık çubuğu ── */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oynatıcıyı kapat"
            onPress={() => {
              router.back();
            }}
            style={styles.roundButton}
          >
            <ArrowLeftIcon size={18} color={colors.ink} />
          </Pressable>

          <Text variant="caption" style={[styles.kicker, { color: colors.inkMuted }]}>
            {(engine.mode === 'silent' ? 'Sessiz okuma' : 'Şimdi dinliyorsun').toLocaleUpperCase(
              'tr-TR',
            )}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oynatıcı menüsü"
            onPress={() => {
              setMenuOpen(true);
            }}
            style={styles.roundButton}
          >
            <MoreVerticalIcon size={18} color={colors.ink} />
          </Pressable>
        </View>

        {/* ── Kapak karosu / metin paneli ── */}
        {showText ? (
          <ScrollView
            style={styles.textPanel}
            contentContainerStyle={styles.textPanelContent}
            showsVerticalScrollIndicator={false}
          >
            <KaraokeText
              page={page}
              activeTokenIndex={karaoke.tokenIndex}
              activeSentenceIndex={karaoke.sentenceIndex}
              highlightEnabled={highlightOn && highlightPossible}
              typography={manifest.typography}
            />
          </ScrollView>
        ) : (
          <View style={styles.coverArea}>
            <Animated.View style={{ transform: [{ translateY: floatY }] }}>
              <NightCover
                seed={storyId}
                uri={page.image.url}
                localUri={offlinePageImage(offlineMeta, page.pageNo)}
                altTr={`${page.pageNo}. sayfa görseli`}
              />
            </Animated.View>
          </View>
        )}

        {/* ── Başlık alanı ── */}
        <View style={styles.titleArea}>
          <Text variant="heading" center numberOfLines={1} style={styles.title}>
            {manifest.titleTr}
          </Text>
          <View style={styles.voiceRow}>
            <Text style={styles.voiceIcon} accessibilityElementsHidden>
              🎙
            </Text>
            <Text variant="caption" style={[styles.voiceLabel, { color: colors.primary }]}>
              {manifest.voice.label}
            </Text>
          </View>
          {engine.mode === 'silent' && !silentFallback ? (
            <View style={styles.silentBadge}>
              <Badge labelTr="Ses şu an açılamadı — sessiz okuma" tone="warning" icon="🔇" />
            </View>
          ) : null}
        </View>

        {/* ── Dalga formu ── */}
        <View style={styles.waveRow} accessibilityElementsHidden>
          {WAVE_HEIGHTS.map((height, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                {
                  height,
                  backgroundColor:
                    i / WAVE_BAR_COUNT < clamped
                      ? 'rgba(176,156,224,0.8)'
                      : 'rgba(255,255,255,0.15)',
                },
              ]}
            />
          ))}
        </View>

        {/* ── İlerleme çubuğu ── */}
        <View style={styles.progressWrap}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Konum çubuğu"
            hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
            onLayout={onTrackLayout}
            onPress={(event) => {
              const width = trackWidthRef.current;
              if (width > 0) {
                setFinished(false);
                engine.seekTo(
                  (event.nativeEvent.locationX / width) * manifest.totalDurationMs,
                );
              }
            }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${clamped * 100}%` }]}>
              <LinearGradient
                colors={[palette.nightPurple, 'rgba(176,156,224,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.progressGradient}
              />
              <View style={styles.progressThumb} />
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <Text variant="caption" style={[styles.timeText, { color: colors.inkMuted }]}>
              {fmtClock(karaoke.positionMs)}
            </Text>
            <Text variant="caption" style={[styles.timeText, { color: colors.inkMuted }]}>
              {`-${fmtClock(remainingMs)}`}
            </Text>
          </View>
        </View>

        {/* ── Kontroller: 15 geri · oynat/duraklat · 15 ileri ── */}
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="15 saniye geri"
            hitSlop={12}
            onPress={() => {
              skipBy(-15_000);
            }}
          >
            <Skip15BackIcon size={28} color={colors.ink} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={engine.playing ? 'Duraklat' : 'Oynat'}
            onPress={engine.toggle}
            style={({ pressed }) => [pressed && styles.pressedDim]}
          >
            <LinearGradient
              colors={[palette.nightPurple, palette.purple600]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playButton}
            >
              {engine.playing ? (
                <PauseIcon size={24} color="#FFFFFF" />
              ) : (
                <PlayIcon size={24} color="#FFFFFF" />
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="15 saniye ileri"
            hitSlop={12}
            onPress={() => {
              skipBy(15_000);
            }}
          >
            <Skip15ForwardIcon size={28} color={colors.ink} />
          </Pressable>
        </View>

        {/* ── Hız çipleri + Zamanlayıcı ── */}
        <View style={styles.chipRow}>
          {SPEED_OPTIONS.map((option) => {
            const selected = userRate === option.rate;
            return (
              <Pressable
                key={option.labelTr}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Hız ${option.labelTr}`}
                onPress={() => {
                  setUserRate(option.rate);
                }}
                style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.chipText,
                    { color: selected ? colors.primary : colors.inkMuted },
                  ]}
                >
                  {option.labelTr}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: bedtimeOn }}
            accessibilityLabel={bedtimeOn ? 'Uyku zamanlayıcısını kapat' : 'Uyku zamanlayıcısını aç'}
            onPress={() => {
              setBedtimeOn((value) => !value);
            }}
            style={[styles.chip, styles.chipTimer, bedtimeOn ? styles.chipSelected : styles.chipIdle]}
          >
            <ClockIcon size={14} color={bedtimeOn ? colors.primary : colors.inkMuted} />
            <Text
              variant="caption"
              style={[
                styles.chipTimerText,
                { color: bedtimeOn ? colors.primary : colors.inkMuted },
              ]}
            >
              Zamanlayıcı
            </Text>
          </Pressable>
        </View>

        {/* ── Metni göster ── */}
        <View style={styles.showTextRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: showText }}
            accessibilityLabel={showText ? 'Metni gizle' : 'Metni göster'}
            onPress={() => {
              setShowText((value) => !value);
            }}
            style={styles.showTextButton}
          >
            <FileTextIcon size={16} color={colors.inkMuted} />
            <Text variant="caption" style={[styles.showTextLabel, { color: colors.inkMuted }]}>
              {showText ? 'Metni gizle' : 'Metni göster'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* ── Uyku modu karartması ── */}
      <Animated.View pointerEvents="none" style={[styles.dimOverlay, { opacity: dimAnim }]} />

      {/* ── Bitiş kartı ── */}
      {finished ? (
        <View style={[styles.endOverlay, { backgroundColor: colors.scrim }]}>
          <View
            style={[
              styles.endCard,
              {
                backgroundColor: colors.surfaceRaised,
                borderRadius: radius.lg,
                padding: spacing.xl,
                gap: spacing.md,
              },
            ]}
          >
            <Text variant="display" center accessibilityElementsHidden>
              🌙
            </Text>
            <Text variant="heading" center>
              Masal bitti, iyi uykular
            </Text>
            <Text variant="body" tone="muted" center>
              {bedtimeOn
                ? 'Uyku modu sesi yavaşça kıstı ve oynatıcıyı durdurdu.'
                : 'Yarın yeni bir maceraya çıkabilirsiniz.'}
            </Text>
            <Button
              label="Baştan dinle"
              variant="secondary"
              onPress={() => {
                setFinished(false);
                engine.restart();
              }}
            />
            <Button
              label="Kitaplığa dön"
              onPress={() => {
                router.back();
              }}
            />
          </View>
        </View>
      ) : null}

      {/* ── ⋯ menüsü (tasarımın sağ üst düğmesi) ── */}
      <Sheet
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
        }}
        titleTr="Oynatıcı menüsü"
      >
        <Button
          label={highlightOn ? 'Kelime vurgusunu kapat' : 'Kelime vurgusunu aç'}
          variant="secondary"
          disabled={!highlightPossible}
          onPress={() => {
            setHighlightOn((value) => !value);
          }}
        />
        {!highlightPossible ? (
          <Text variant="caption" tone="muted">
            Bu seslendirmede kelime zamanlaması yok; vurgu bu yüzden kapalı.
          </Text>
        ) : null}
        <Button
          label={autoPageTurn ? 'Otomatik sayfa çevirmeyi kapat' : 'Otomatik sayfa çevirmeyi aç'}
          variant="secondary"
          onPress={() => {
            setAutoPageTurn((value) => !value);
          }}
        />
        {storyQuery.data !== undefined ? (
          <Button
            label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            variant="secondary"
            busy={toggleFavorite.isPending}
            onPress={() => {
              toggleFavorite.mutate({ storyId, isFavorite: !isFavorite });
            }}
          />
        ) : null}
        <Button
          label="Sesler"
          variant="ghost"
          onPress={() => {
            setMenuOpen(false);
            router.push({ pathname: '/(app)/hikaye/[id]/sesler', params: { id: storyId } });
          }}
        />
      </Sheet>
    </View>
  );
}

export function PlayerScreen(props: PlayerScreenProps): ReactElement {
  /* Oynatıcı HER ZAMAN gece temasında — yatma saati ekranı. */
  return (
    <ThemeScope mode="dark">
      <PlayerInner {...props} />
    </ThemeScope>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  pressedDim: { opacity: 0.85 },

  /* Parlama daireleri — Figma: top -100 ortalanmış / bottom 100 right -80. */
  glowTop: { position: 'absolute', top: -100, alignSelf: 'center' },
  glowBottom: { position: 'absolute', bottom: 100, right: -80 },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },

  content: { flex: 1, backgroundColor: 'transparent' },

  /* Başlık çubuğu — Figma: padding 52 24 0 (üst boşluğu güvenli alan verir). */
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontSize: 11, lineHeight: 15, letterSpacing: 0.88 },

  /* Kapak — Figma: padding 40 0 36; küçük ekranda esner. */
  coverArea: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  textPanel: { flexGrow: 1, paddingHorizontal: 32 },
  textPanelContent: { paddingVertical: 16 },

  /* Başlık alanı — Figma: Fraunces 24, altında night-purple ses satırı. */
  titleArea: { paddingHorizontal: 32, alignItems: 'center', gap: 8 },
  title: { fontSize: 24, lineHeight: 29, letterSpacing: -0.24 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceIcon: { fontSize: 14, lineHeight: 18 },
  voiceLabel: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  silentBadge: { marginTop: 4 },

  /* Dalga formu — Figma: 28 çubuk, genişlik 3, aralık 3. */
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 24,
    height: 24 + 24,
  },
  waveBar: { width: 3, borderRadius: 2 },

  /* İlerleme — Figma: padding 20 32 0, 4px ray, 14px beyaz başparmak. */
  progressWrap: { paddingHorizontal: 32, paddingTop: 20 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    right: -6,
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeText: { fontSize: 12, lineHeight: 16 },

  /* Kontroller — Figma: gap 32, oynat 72px degrade daire. */
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingTop: 28,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  /* Hız + Zamanlayıcı — Figma: padding 24 32 0, gap 12. */
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipIdle: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.1)' },
  chipSelected: {
    backgroundColor: 'rgba(176,156,224,0.2)',
    borderColor: 'rgba(176,156,224,0.5)',
  },
  chipText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  chipTimer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipTimerText: { fontSize: 13, lineHeight: 17, fontWeight: '600' },

  /* Metni göster — Figma: padding 20 0 0. */
  showTextRow: { alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
  showTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  showTextLabel: { fontSize: 14, lineHeight: 19, fontWeight: '600' },

  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  endOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  endCard: { alignSelf: 'stretch' },
});
