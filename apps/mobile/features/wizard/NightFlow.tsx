/**
 * NightFlow — gece gökyüzü akış yüzeyi (Figma `StoryGenerating` + `VoiceStudio`
 * kayıt ekranları). Masal üretimi ve ses stüdyosunun kayıt bölümü ürünün en
 * duygusal anlarıdır; tasarım bu anları gündüz kreminden çıkarıp yıldızlı gece
 * degradesine taşır.
 *
 * `NightScreen` alt ağacı `ThemeScope mode="dark"`a alır: içindeki her
 * `@kendihikayem/ui` bileşeni (Text, Button, Card, DbMeter…) kendiliğinden gece
 * paletine döner — ekranlar renk kodu yazmaz.
 *
 * packages/ui'ye TERFİ ADAYLARI: NightScreen, StarField, FloatingBook.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { StorybookLogo, Text, ThemeScope, palette, useTheme } from '@kendihikayem/ui';

/** Splash ile aynı gece degradesi — uygulama tek gece gökyüzü tanır. */
export const NIGHT_GRADIENT = [palette.deepPlum, palette.royalPurple, palette.night950] as const;

/**
 * Figma `StoryGenerating` mesaj akışı — TASARIMDAKİ METİNLER BİREBİR.
 * Son eleman yalnızca iş bittiğinde gösterilir; iş sürerken akış sondan bir
 * önceki mesajda bekler (tasarım da aynı şekilde min() ile tavanlıyor).
 */
export const TALE_MESSAGES = [
  'Hikâyenin kahramanı hazırlanıyor…',
  'Biraz yıldız tozu ekliyoruz…',
  'Sihirli sözcükler seçiliyor…',
  'Masalın renkleri belirleniyor…',
  'Son dokunuşlar yapılıyor…',
  'Masalın hazır! ✨',
] as const;

/**
 * Tasarımın masalsı dönen mesajları (büyük Fraunces satır) + tasarımın alt
 * satır yuvasında GERÇEK durum bilgisi (`statusTr`, ör. job.progress.labelTr).
 * Görsel akış tasarımın; veri sözleşmeden.
 */
export function TaleMessages({
  done = false,
  statusTr,
}: {
  /** İş bitti → "Masalın hazır! ✨" gösterilir. */
  done?: boolean;
  /** Alt satır: tasarımdaki "Ege ve Kayıp Yıldız hazırlanıyor" yuvası. */
  statusTr?: string;
}): ReactNode {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (done) return undefined;
    const interval = setInterval(() => {
      setMsgIndex((prev) => Math.min(prev + 1, TALE_MESSAGES.length - 2));
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [done]);

  return (
    <View style={styles.taleBox}>
      <Text
        variant="heading"
        center
        style={styles.taleBig}
        accessibilityLiveRegion="polite"
      >
        {done ? TALE_MESSAGES[TALE_MESSAGES.length - 1] : TALE_MESSAGES[msgIndex]}
      </Text>
      {statusTr !== undefined && (
        <Text variant="caption" center style={styles.taleStatus}>
          {statusTr}
        </Text>
      )}
    </View>
  );
}

/**
 * Tasarımın ilerleme çubuğu: 280 genişlik, 4 yükseklik, mor→altın degrade dolgu.
 * Dolgu oranı GERÇEK iş ilerlemesinden gelir (adım sayısı), yüzde uydurulmaz.
 */
export function NightProgress({ ratio }: { ratio: number }): ReactNode {
  const clamped = Math.max(0.05, Math.min(1, ratio));
  const width: `${number}%` = `${Math.round(clamped * 100)}%`;
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <LinearGradient
          colors={[palette.nightPurple, '#FFD97D']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.progressFill, { width }]}
        />
      </View>
    </View>
  );
}

/**
 * Figma `VoiceStudio` processing görünümündeki dönen halka: 80'lik lavanta
 * daire içinde açık uçlu çember, yavaşça döner.
 */
export function ProcessingRing(): ReactNode {
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3000, useNativeDriver: true }),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[styles.processingRing, { transform: [{ rotate }] }]}
    >
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={12}
          cy={12}
          r={10}
          stroke={palette.lavender}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={40}
          strokeDashoffset={10}
        />
      </Svg>
    </Animated.View>
  );
}

/** Deterministic star field — same layout every launch, no Math.random in render. */
const STARS = Array.from({ length: 22 }, (_, i) => ({
  size: i % 3 === 0 ? 3 : 2,
  opacity: 0.25 + (i % 5) * 0.12,
  top: `${(i * 43 + 9) % 100}%` as const,
  left: `${(i * 67 + 13) % 100}%` as const,
}));

export function StarField(): ReactNode {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {STARS.map((star, i) => (
        <View
          key={i}
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
    </View>
  );
}

/**
 * Yüzen açık kitap — tasarımın "sıradan spinner yok" ilkesinin görsel merkezi.
 * Sakin bir salınım (±6 px, 3 sn) ve tepesinde nabız gibi atan altın nokta.
 */
export function FloatingBook({ size = 128 }: { size?: number }): ReactNode {
  const [float] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -6, duration: 1500, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ]),
    );
    floatLoop.start();
    pulseLoop.start();
    return () => {
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, [float, pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        styles.bookBox,
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          transform: [{ translateY: float }],
        },
      ]}
    >
      <Animated.View style={[styles.bookDot, { opacity: pulse }]} />
      <StorybookLogo size={Math.round(size * 0.55)} />
    </Animated.View>
  );
}

/**
 * Gece ekran kabuğu: degrade + yıldızlar + güvenli alan + koyu tema kapsamı.
 * Sekmesiz akışlarda (`includeBottom`) alt kenar da güvenli alana alınır.
 */
export function NightScreen({
  children,
  scroll = false,
  includeBottom = false,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Sekme çubuğu olmayan ekranlarda (onboarding grubu) true verin. */
  includeBottom?: boolean;
  testID?: string;
}): ReactNode {
  const edges = includeBottom
    ? (['top', 'left', 'right', 'bottom'] as const)
    : (['top', 'left', 'right'] as const);
  return (
    <ThemeScope mode="dark">
      <LinearGradient
        colors={[...NIGHT_GRADIENT]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.fill}
        testID={testID}
      >
        <StarField />
        <SafeAreaView edges={edges} style={styles.fill}>
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.fill, styles.pad]}>{children}</View>
          )}
        </SafeAreaView>
      </LinearGradient>
    </ThemeScope>
  );
}

/** Gece başlık çubuğu: yarı saydam geri dairesi + kicker + başlık. */
export function NightHeader({
  kickerTr,
  titleTr,
  onBack,
}: {
  kickerTr: string;
  titleTr: string;
  onBack?: () => void;
}): ReactNode {
  const { spacing } = useTheme();
  return (
    <View style={[styles.headerRow, { gap: spacing.md }]}>
      {onBack !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [
            styles.nightBack,
            pressed && { backgroundColor: 'rgba(255,255,255,0.2)' },
          ]}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 18l-6-6 6-6"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      )}
      <View style={styles.headerTexts}>
        <Text variant="caption" style={styles.kicker}>
          {kickerTr.toLocaleUpperCase('tr-TR')}
        </Text>
        <Text variant="bodyStrong" style={styles.headerTitle} accessibilityRole="header">
          {titleTr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 24, gap: 16 },
  scroll: { padding: 24, paddingBottom: 48, gap: 16 },

  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },

  /* Figma StoryGenerating: Fraunces 22, beyaz, min 60 yükseklik; alt satır lavanta. */
  taleBox: { gap: 12, paddingHorizontal: 8, alignItems: 'center' },
  taleBig: { color: '#FFFFFF', fontSize: 22, lineHeight: 30, minHeight: 60 },
  taleStatus: { color: 'rgba(176,156,224,0.7)' },

  /* Figma: 280 genişlik · 4 yükseklik · mor→altın degrade dolgu. */
  progressWrap: { width: '100%', maxWidth: 280, alignSelf: 'center' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  processingRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(176,156,224,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bookBox: {
    alignSelf: 'center',
    backgroundColor: 'rgba(176, 156, 224, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(176, 156, 224, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookDot: {
    position: 'absolute',
    top: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.moonGold,
    shadowColor: palette.moonGold,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

  headerRow: { flexDirection: 'row', alignItems: 'center' },
  nightBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: { flex: 1, gap: 2 },
  kicker: {
    color: 'rgba(176,156,224,0.9)',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  headerTitle: { color: '#FFFFFF' },
});
