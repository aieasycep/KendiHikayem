/**
 * PlayerScreen — P01 oynatıcı (ürünün kalbi).
 *
 * Sahne: ışıklar kısık, çocuk yatakta, ebeveynin tek eli boşta. Bu yüzden:
 *  - HER ZAMAN gece teması (ThemeScope dark) — kitaplık gündüz kalsa bile.
 *  - Tek büyük oynat/durdur düğmesi altta, baş parmak menzilinde.
 *  - Tam ekran görsel; metin alt bölgede, karaoke vurgusuyla.
 *  - Uyku modu: manifest'teki sayfadan itibaren ekran yavaşça kararır, ses ve
 *    tempo yumuşar, masal bitince kendiliğinden durur.
 *  - Ses yüklenemezse (mock CDN 404 / imzalı URL süresi doldu) SESSİZ OKUMA
 *    moduna düşer: vurgu sanal saatle akar, hiçbir şey bloklanmaz.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
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
  Chip,
  PlayIcon,
  Row,
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
import { ChevronLeftIcon, ChevronRightThinIcon, PauseIcon } from './icons';
import { useSaveProgress } from './hooks';
import { ArrowLeftIcon } from '../library/icons';
import { offlineAudio, offlinePageImage, type OfflineStoryMeta } from '../library/offline';

/** "3:24" biçimli süre — tasarımdaki geçen/kalan süre satırı. */
function fmtClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Tasarımdaki hız seçenekleri (Figma AudioPlayer "0.8x / 1x / 1.2x"). */
const SPEED_OPTIONS = [
  { labelTr: '0,8x', rate: 0.8 },
  { labelTr: '1x', rate: 1 },
  { labelTr: '1,2x', rate: 1.2 },
] as const;

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
  const { colors, spacing, radius, motion } = useTheme();
  const { height } = useWindowDimensions();

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
  /** Kullanıcının hız seçimi — uyku modu eğrisiyle ÇARPILIR, onu ezmez. */
  const [userRate, setUserRate] = useState(1);

  const saveProgress = useSaveProgress();
  const highlightPossible = canWordHighlight(manifest) || manifest.pages.some((p) => p.sentences.length > 0);

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
      /* Sayfa değişti → konumu kaydet (L01 devam kartı buradan beslenir). */
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

  const goToPage = useCallback(
    (index: number): void => {
      const target = pages[Math.max(0, Math.min(pages.length - 1, index))];
      if (target !== undefined) {
        setFinished(false);
        engine.seekTo(target.startMs + 1);
      }
    },
    [pages, engine],
  );

  if (page === undefined) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <Text variant="body" tone="muted" center>
          Bu masalın sayfaları henüz hazır değil.
        </Text>
      </View>
    );
  }

  const overallProgress = manifest.totalDurationMs > 0 ? karaoke.positionMs / manifest.totalDurationMs : 0;
  const imageHeight = Math.max(240, height * 0.5);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* ── Görsel ─────────────────────────────────────────── */}
      <View style={{ height: imageHeight }}>
        <NightCover
          seed={storyId}
          uri={page.image.url}
          localUri={offlinePageImage(offlineMeta, page.pageNo)}
          altTr={`${page.pageNo}. sayfa görseli`}
        />
        {/* Üst bar */}
        <View style={[styles.topBar, { paddingHorizontal: spacing.md, paddingTop: spacing.xl }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oynatıcıyı kapat"
            onPress={() => {
              router.back();
            }}
            style={styles.roundButton}
          >
            <ArrowLeftIcon size={18} color="#FFFFFF" />
          </Pressable>
          <View style={styles.topCenter}>
            <Text variant="caption" style={styles.kicker}>
              {(engine.mode === 'silent' ? 'Sessiz okuma' : 'Şimdi dinliyorsun').toLocaleUpperCase(
                'tr-TR',
              )}
            </Text>
            <Text variant="label" style={styles.topTitle} numberOfLines={1}>
              {manifest.titleTr}
            </Text>
            <Text variant="caption" style={styles.topMeta}>
              {engine.mode === 'silent'
                ? `${page.pageNo} / ${pageCount}`
                : `🎙 ${manifest.voice.label} · ${page.pageNo} / ${pageCount}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oynatıcı ayarları"
            onPress={() => {
              setMenuOpen(true);
            }}
            style={styles.roundButton}
          >
            <Text variant="heading" style={styles.roundGlyph}>
              ⋯
            </Text>
          </Pressable>
        </View>
        {engine.mode === 'silent' && !silentFallback ? (
          <View style={[styles.silentBadge, { left: spacing.md, bottom: spacing.md }]}>
            <Badge labelTr="Ses şu an açılamadı — sessiz okuma" tone="warning" icon="🔇" />
          </View>
        ) : null}
      </View>

      {/* ── Metin paneli (alt bölge) ───────────────────────── */}
      <View
        style={[
          styles.panel,
          {
            backgroundColor: colors.background,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          },
        ]}
      >
        <View style={styles.textWrap}>
          <KaraokeText
            page={page}
            activeTokenIndex={karaoke.tokenIndex}
            activeSentenceIndex={karaoke.sentenceIndex}
            highlightEnabled={highlightOn && highlightPossible}
            typography={manifest.typography}
          />
        </View>

        {/* İlerleme çizgisi + süre satırı */}
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
            <LinearGradient
              colors={[palette.nightPurple, palette.lavender]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(Math.max(0.02, Math.min(1, overallProgress)) * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.timeRow}>
            <Text variant="caption" tone="muted" style={styles.timeText}>
              {fmtClock(karaoke.positionMs)}
            </Text>
            <Text variant="caption" tone="muted" style={styles.timeText}>
              {`-${fmtClock(Math.max(0, manifest.totalDurationMs - karaoke.positionMs))}`}
            </Text>
          </View>
        </View>

        {/* Kontroller — baş parmak bölgesi */}
        <View style={[styles.controls, { paddingBottom: spacing.lg, gap: spacing.xl }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Önceki sayfa"
            disabled={karaoke.pageIndex === 0}
            onPress={() => {
              goToPage(karaoke.pageIndex - 1);
            }}
            style={[
              styles.sideButton,
              { borderColor: colors.border },
              karaoke.pageIndex === 0 && styles.disabled,
            ]}
          >
            <ChevronLeftIcon size={22} color={colors.inkMuted} />
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
                <PauseIcon size={28} color="#FFFFFF" />
              ) : (
                <PlayIcon size={30} color="#FFFFFF" />
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki sayfa"
            disabled={karaoke.pageIndex >= pageCount - 1}
            onPress={() => {
              goToPage(karaoke.pageIndex + 1);
            }}
            style={[
              styles.sideButton,
              { borderColor: colors.border },
              karaoke.pageIndex >= pageCount - 1 && styles.disabled,
            ]}
          >
            <ChevronRightThinIcon size={22} color={colors.inkMuted} />
          </Pressable>
        </View>
      </View>

      {/* ── Uyku modu karartması ───────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.dimOverlay, { opacity: dimAnim }]}
      />

      {/* ── Bitiş kartı ────────────────────────────────────── */}
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

      {/* ── Ayar sayfası ───────────────────────────────────── */}
      <Sheet
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
        }}
        titleTr="Oynatıcı ayarları"
      >
        <Text variant="label" tone="muted">
          Okuma hızı
        </Text>
        <Row gap="sm">
          {SPEED_OPTIONS.map((option) => (
            <Chip
              key={option.labelTr}
              label={option.labelTr}
              selected={userRate === option.rate}
              onPress={() => {
                setUserRate(option.rate);
              }}
            />
          ))}
        </Row>
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
        <Button
          label={bedtimeOn ? 'Uyku modunu kapat' : 'Uyku modunu aç'}
          variant="secondary"
          onPress={() => {
            setBedtimeOn((value) => !value);
          }}
        />
        <Button
          label="Sesler ve paylaşım"
          variant="ghost"
          onPress={() => {
            setMenuOpen(false);
            router.back();
          }}
        />
        <Text variant="caption" tone="muted">
          Ses seçimi, metin düzenleme ve paylaşım hikaye ekranındadır.
        </Text>
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
  fill: { flex: 1 },
  pressedDim: { opacity: 0.85 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  kicker: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    textShadowColor: 'rgba(13,27,46,0.6)',
    textShadowRadius: 6,
  },
  topTitle: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(13,27,46,0.6)',
    textShadowRadius: 6,
  },
  topMeta: {
    color: 'rgba(255,255,255,0.75)',
    textShadowColor: 'rgba(13,27,46,0.6)',
    textShadowRadius: 6,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,27,46,0.45)',
  },
  roundGlyph: { color: '#FFFFFF' },
  silentBadge: { position: 'absolute' },
  panel: { flex: 1, justifyContent: 'space-between' },
  textWrap: { flexShrink: 1, overflow: 'hidden' },
  progressWrap: { marginVertical: 10, gap: 6 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { fontSize: 12, lineHeight: 16 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
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
