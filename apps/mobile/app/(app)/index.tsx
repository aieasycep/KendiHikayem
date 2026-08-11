import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';

import type { StorySummary } from '@kendihikayem/contract';
import {
  ChevronRightIcon,
  Chip,
  Row,
  Screen,
  Skeleton,
  Text,
  fontFamilies,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { useThemes } from '../../features/onboarding/catalogHooks';
import { useChildren, useStories } from '../../features/library/hooks';
import { useSession } from '../../lib/session';

/**
 * H01 Ana Sayfa — uygulamanın açılış ekranı (Figma `Home.tsx` BİREBİR taşıması).
 *
 * Bölümler tasarımdaki sırayla:
 *   1. Karşılama ("İyi akşamlar 👋" — tasarımdaki sabit metin) + çocuk avatarı
 *   2. Hero: "«çocuk» için bir hikâye oluştur" (tek birincil eylem)
 *   3. Çocuğa göre öneriler (katalog temaları — sözleşmeden gelir)
 *   4. Kaldığın yerden devam et ("%N tamamlandı" + ilerleme çubuğu)
 *   5. En son oluşturdukların (yatay şerit)
 *   6. Bu gece için kategoriler (katalog temaları)
 *
 * VERİ: her bölüm `packages/mock` fixture'larını sözleşme uçları üzerinden
 * okur (stories.list, children.list, catalog.themes) — ekrana sabit dizi
 * gömülmez. "Hikâye oluştur" eylemi misafiri ilk-masal akışına (kim-icin),
 * oturumlu kullanıcıyı sihirbaza götürür.
 */

/** Ürün standardı: her masal 12 sayfadır (SPEC — sihirbaz da bunu üretir). */
const STORY_PAGE_COUNT = 12;

/** Kapak pastelleri + emojiler — fixture kapak görselleri kasıtlı 404 olduğundan
 * kapaklar tasarımdaki gibi düz renk + emoji ile temsil edilir (dekoratif). */
const COVER_TINTS = [palette.lavenderPale, palette.babyBlue, palette.mintGreen, palette.peach];
const COVER_EMOJIS = ['⭐', '🚀', '🌿', '🐻', '🌙', '✨'];

function coverVisual(index: number): { tint: string; emoji: string } {
  return {
    tint: COVER_TINTS[index % COVER_TINTS.length] ?? palette.lavenderPale,
    emoji: COVER_EMOJIS[index % COVER_EMOJIS.length] ?? '⭐',
  };
}

export default function AnaSayfa(): ReactNode {
  const router = useRouter();
  const session = useSession();
  const { colors, radius, type, fontsReady } = useTheme();

  const childrenQuery = useChildren();
  const storiesQuery = useStories();
  const child = childrenQuery.data?.[0];
  const themesQuery = useThemes(child?.ageBand);

  const stories = useMemo(() => storiesQuery.data ?? [], [storiesQuery.data]);
  const themes = themesQuery.data ?? [];
  const suggestions = themes.slice(0, 3);
  const categories = themes.slice(0, 6);

  /** "Kaldığın yerden devam et" — en güncel yarım kalan masal. */
  const continueStory = useMemo(
    () =>
      stories.find(
        (story) =>
          story.lastReadPageNo !== undefined &&
          story.lastReadPageNo > 1 &&
          (story.status === 'approved' || story.status === 'ready'),
      ),
    [stories],
  );

  const childName = child?.givenName;

  /** Figma devam kartı: "%68 tamamlandı" — yüzde son okunan sayfadan türetilir. */
  const continuePercent = Math.min(
    100,
    Math.round(((continueStory?.lastReadPageNo ?? 0) / STORY_PAGE_COUNT) * 100),
  );

  /** Hikâye oluşturma girişi: misafir → ilk-masal akışı, kullanıcı → sihirbaz. */
  const startCreate = (): void => {
    if (session.phase === 'user') router.push('/(app)/sihirbaz');
    else router.push('/(onboarding)/kim-icin');
  };

  const openStory = (story: StorySummary): void => {
    router.push({ pathname: '/(app)/hikaye/[id]', params: { id: story.id as string } });
  };

  /** Fraunces kart başlıkları — Figma: devam kartı 16, şerit kartı 13. */
  const serifCard: TextStyle = { ...type.heading, fontSize: 16, lineHeight: 21 };
  const serifRail: TextStyle = { ...type.heading, fontSize: 13, lineHeight: 17 };

  return (
    <Screen flush style={styles.scroll} testID="anasayfa">
      {/* ── 1. Karşılama (Figma: sabit akşam selamı) ──────────── */}
      <LinearGradient
        colors={['rgba(176, 156, 224, 0.15)', 'rgba(176, 156, 224, 0)']}
        style={styles.header}
      >
        <View style={styles.headerTexts}>
          <Text variant="caption" tone="muted">
            İyi akşamlar 👋
          </Text>
          <Text variant="title" accessibilityRole="header" style={styles.headerTitle}>
            Bu gece hangi masala{'\n'}yolculuk ediyoruz?
          </Text>
        </View>
        {child !== undefined ? (
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={[palette.lavenderPale, palette.lavender]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarEmoji} accessibilityElementsHidden>
                🧒
              </Text>
            </LinearGradient>
            <Text
              variant="caption"
              style={{ color: colors.primary, fontSize: 11, lineHeight: 15, fontWeight: '700' }}
            >
              {child.givenName}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      {/* ── 2. Hero: yeni masal ───────────────────────────────── */}
      <View style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            childName !== undefined
              ? `${childName} için yeni bir hikâye oluştur`
              : 'Yeni bir hikâye oluştur'
          }
          onPress={startCreate}
          style={({ pressed }) => [pressed && styles.pressedDim]}
        >
          <LinearGradient
            colors={[palette.royalPurple, palette.purple600, palette.nightPurple]}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { borderRadius: radius.xl }]}
          >
            <View style={[styles.heroCircle, styles.heroCircleBig]} />
            <View style={[styles.heroCircle, styles.heroCircleSmall]} />
            <Text style={styles.heroSparkleTop} accessibilityElementsHidden>
              ✨
            </Text>
            <Text style={styles.heroSparkleBottom} accessibilityElementsHidden>
              ⭐
            </Text>

            <Text variant="caption" style={styles.heroKicker}>
              YENİ MASAL
            </Text>
            <Text variant="heading" style={styles.heroTitle}>
              {childName !== undefined
                ? `${childName} için bir hikâye oluştur`
                : 'Çocuğun için bir hikâye oluştur'}
            </Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaEmoji} accessibilityElementsHidden>
                ✨
              </Text>
              <Text
                style={[
                  styles.heroCtaText,
                  { color: colors.primary },
                  fontsReady
                    ? { fontFamily: fontFamilies.bodyExtraBold }
                    : styles.heroCtaTextFallback,
                ]}
              >
                Masalımı Oluştur
              </Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      {/* ── 3. Öneriler ───────────────────────────────────────── */}
      <View style={styles.section}>
        <Row justify="space-between">
          <Text variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
            {childName !== undefined ? `${childName} için öneriler` : 'Sana özel öneriler'}
          </Text>
          <Pressable accessibilityRole="button" onPress={startCreate} hitSlop={8}>
            <Text variant="caption" style={[styles.linkAll, { color: colors.primary }]}>
              Tümü
            </Text>
          </Pressable>
        </Row>
        {themesQuery.isLoading ? (
          <View style={styles.list}>
            <Skeleton height={68} rounded />
            <Skeleton height={68} rounded />
          </View>
        ) : (
          <View style={styles.list}>
            {suggestions.map((theme) => (
              <Pressable
                key={theme.code}
                accessibilityRole="button"
                accessibilityLabel={`${theme.titleTr} temalı bir masal oluştur`}
                onPress={startCreate}
                style={({ pressed }) => [
                  styles.suggestion,
                  styles.cardShadowSm,
                  {
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.suggestionIcon,
                    { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm },
                  ]}
                >
                  <Text style={styles.suggestionEmoji} accessibilityElementsHidden>
                    {theme.icon}
                  </Text>
                </View>
                <View style={styles.suggestionTexts}>
                  <Text variant="label" numberOfLines={1} style={styles.suggestionTitle}>
                    {theme.titleTr}
                  </Text>
                  <Text
                    variant="caption"
                    tone="muted"
                    numberOfLines={1}
                    style={styles.suggestionSub}
                  >
                    {theme.subtitleTr}
                  </Text>
                </View>
                <ChevronRightIcon size={16} />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── 4. Devam kartı ────────────────────────────────────── */}
      {continueStory !== undefined ? (
        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
            Kaldığın yerden devam et
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${continueStory.title} — yüzde ${continuePercent} tamamlandı, dinlemeye devam et`}
            onPress={() => {
              router.push({
                pathname: '/(app)/hikaye/[id]/oynat',
                params: { id: continueStory.id as string },
              });
            }}
            style={({ pressed }) => [
              styles.continueCard,
              styles.cardShadowMd,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.lg,
              },
              pressed && styles.pressedDim,
            ]}
          >
            <LinearGradient
              colors={[palette.lavenderPale, palette.lavenderMist]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueCover}
            >
              <Text style={styles.continueEmoji} accessibilityElementsHidden>
                ⭐
              </Text>
            </LinearGradient>
            <View style={styles.continueBody}>
              <Text style={serifCard} numberOfLines={1}>
                {continueStory.title}
              </Text>
              <Row gap="xs">
                <Text variant="caption" tone="muted" numberOfLines={1} style={styles.meta12}>
                  {continueStory.voiceLabels[0] ?? 'Sistem sesi'}
                </Text>
                <View style={[styles.metaDot, { backgroundColor: colors.inkMuted }]} />
                <Text variant="caption" tone="accent" style={[styles.meta12, styles.metaStrong]}>
                  %{continuePercent} tamamlandı
                </Text>
              </Row>
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                <LinearGradient
                  colors={[palette.purple600, palette.lavender]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${continuePercent}%` }]}
                />
              </View>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* ── 5. En son oluşturdukların ─────────────────────────── */}
      <View style={styles.railSection}>
        <Row justify="space-between" style={styles.railHeader}>
          <Text variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
            En son oluşturdukların
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push('/(app)/kitaplik');
            }}
            hitSlop={8}
          >
            <Text variant="caption" style={[styles.linkAll, { color: colors.primary }]}>
              Tümü
            </Text>
          </Pressable>
        </Row>
        {storiesQuery.isLoading ? (
          <View style={styles.railLoading}>
            <Skeleton width={140} height={150} rounded />
            <Skeleton width={140} height={150} rounded />
          </View>
        ) : stories.length === 0 ? (
          <View style={styles.railEmpty}>
            <Text variant="caption" tone="muted">
              İlk masalın burada yaşayacak.
            </Text>
            <Chip label="✨ İlk masalını oluştur" onPress={startCreate} />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {stories.map((story, index) => {
              const visual = coverVisual(index);
              return (
                <Pressable
                  key={story.id as string}
                  accessibilityRole="button"
                  accessibilityLabel={story.title}
                  onPress={() => {
                    openStory(story);
                  }}
                  style={({ pressed }) => [
                    styles.storyCard,
                    styles.cardShadowSm,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                    },
                    pressed && styles.pressedDim,
                  ]}
                >
                  <View style={[styles.storyCover, { backgroundColor: visual.tint }]}>
                    <Text style={styles.storyCoverEmoji} accessibilityElementsHidden>
                      {visual.emoji}
                    </Text>
                  </View>
                  <View style={styles.storyBody}>
                    <Text style={serifRail} numberOfLines={2}>
                      {story.title}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1} style={styles.meta11}>
                      {story.voiceLabels.length > 0
                        ? `${story.childName} · ${story.voiceLabels[0]}`
                        : story.childName}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── 6. Bu gece için ───────────────────────────────────── */}
      <View style={[styles.section, styles.lastSection]}>
        <Text variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
          Bu gece için
        </Text>
        <View style={styles.categoryGrid}>
          {categories.map((theme) => (
            <Pressable
              key={theme.code}
              accessibilityRole="button"
              accessibilityLabel={`${theme.titleTr} temalı bir masal oluştur`}
              onPress={startCreate}
              style={({ pressed }) => [
                styles.categoryCard,
                styles.cardShadowXs,
                {
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={styles.categoryEmoji} accessibilityElementsHidden>
                {theme.icon}
              </Text>
              <Text variant="caption" center numberOfLines={1} style={styles.categoryLabel}>
                {theme.titleTr}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Screen'in varsayılan 16px bölüm arası boşluğu kapatılır — tasarımın ritmi
   * her bölümün kendi 24px alt dolgusudur (Figma: padding "0 24px 24px"). */
  scroll: { gap: 0 },

  pressedDim: { opacity: 0.85 },

  /* Figma kart gölgeleri */
  cardShadowXs: {
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardShadowSm: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardShadowMd: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  /* Karşılama — Figma: padding "56px 24px 24px" (56'nın durum çubuğu kısmını
   * SafeArea verir → +12). */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  headerTexts: { flex: 1, gap: 4 },
  /* Figma: Fraunces 26 · lineHeight 1.2 · letterSpacing -0.01em */
  headerTitle: { fontSize: 26, lineHeight: 31, letterSpacing: -0.26 },
  avatarWrap: { alignItems: 'center', gap: 4 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatarEmoji: { fontSize: 20 },

  /* "Tümü" bağlantısı — Figma: 13 · 600 */
  linkAll: { fontSize: 13, lineHeight: 18, fontWeight: '600' },

  /* Bölüm iskeleti — Figma: her bölüm "0 24px 24px", başlık altı 12 */
  section: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
  lastSection: { paddingBottom: 32 },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  list: { gap: 8 },

  /* Hero — Figma: padding 28/24, başlık Fraunces 24 · 1.2 · maxWidth 200 */
  hero: { paddingVertical: 28, paddingHorizontal: 24, overflow: 'hidden' },
  heroCircle: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
  heroCircleBig: { right: -20, top: -20, width: 120, height: 120, borderRadius: 60 },
  heroCircleSmall: {
    right: 30,
    bottom: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroSparkleTop: { position: 'absolute', top: 16, right: 20, fontSize: 20, opacity: 0.8 },
  heroSparkleBottom: { position: 'absolute', bottom: 16, right: 60, fontSize: 14, opacity: 0.6 },
  /* Figma: 12 · 600 · letterSpacing 0.06em */
  heroKicker: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
    marginBottom: 8,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 29, maxWidth: 200, marginBottom: 20 },
  /* Figma: beyaz hap yerine 14px köşeli rozet, padding 10/20 */
  heroCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  heroCtaEmoji: { fontSize: 16 },
  /* Figma: Nunito 800 · 14 */
  heroCtaText: { fontSize: 14, lineHeight: 19 },
  heroCtaTextFallback: { fontWeight: '800' },

  /* Öneri kartı */
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionEmoji: { fontSize: 20 },
  suggestionTexts: { flex: 1, gap: 2 },
  /* Figma: başlık 14 · 700, alt satır 12 · 500 */
  suggestionTitle: { fontSize: 14, lineHeight: 19 },
  suggestionSub: { fontSize: 12, lineHeight: 16 },

  /* Devam kartı */
  continueCard: { borderWidth: 1, overflow: 'hidden' },
  continueCover: { height: 80, alignItems: 'center', justifyContent: 'center' },
  continueEmoji: { fontSize: 36 },
  continueBody: { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  /* Figma meta satırları: 12 ve 11 punto */
  meta12: { fontSize: 12, lineHeight: 16 },
  meta11: { fontSize: 11, lineHeight: 15 },
  metaStrong: { fontWeight: '700' },
  metaDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.4 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', borderRadius: 2 },

  /* Son hikayeler şeridi — Figma: padding "0 0 24px" */
  railSection: { paddingBottom: 24, gap: 12 },
  railHeader: { paddingHorizontal: 24 },
  rail: { paddingHorizontal: 24, gap: 12 },
  railLoading: { flexDirection: 'row', gap: 12, paddingHorizontal: 24 },
  railEmpty: { paddingHorizontal: 24, gap: 8, alignItems: 'flex-start' },
  storyCard: { width: 140, borderWidth: 1, overflow: 'hidden' },
  storyCover: { height: 100, alignItems: 'center', justifyContent: 'center' },
  storyCoverEmoji: { fontSize: 36 },
  storyBody: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },

  /* Kategori ızgarası — Figma: yarıçap 14, etiket 11 · 700 */
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryCard: {
    flexBasis: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  categoryEmoji: { fontSize: 22 },
  categoryLabel: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
});
