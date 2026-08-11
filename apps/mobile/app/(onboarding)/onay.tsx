import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import type { ApiError, Story } from '@kendihikayem/contract';
import { NoticeBox, Text, useTheme } from '@kendihikayem/ui';

import { PrimaryButton } from '../../components/ui';
import {
  ErrorBanner,
  SecondaryButton,
  SelectedCheck,
} from '../../features/onboarding/components';
import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

/**
 * S09 — ⏸ İSKELET ONAYI, KAPI 1. ⭐ The highest-leverage screen in the product.
 *
 * The parent sees the 12-scene draft and 3 character variants and decides in
 * ~5 seconds. If they walk away, the expensive stage NEVER ran: the abandoned
 * user cost $0.03, not $4. Actions (SPEC §11.1):
 *   [Devam et]            → variant kaydedilir + approveOutline (cost acknowledged)
 *   [Başka bir açı]       → rejectOutline(regenerate) → yeni iskelet, dolgu yine çalışmaz
 *   [Karakteri değiştir]  → scrolls to the variant picker
 */
export default function Onay(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { storyId, toplamKredi } = useLocalSearchParams<{
    storyId: string;
    toplamKredi?: string;
  }>();

  const scrollRef = useRef<ScrollView>(null);
  const variantSectionY = useRef(0);
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<'approve' | 'reject' | undefined>(undefined);
  const [actionError, setActionError] = useState<ApiError | undefined>(undefined);

  const storyQuery = useQuery<Story, ApiError>({
    queryKey: ['story', storyId],
    enabled: storyId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().stories.get({ params: { storyId: storyId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    refetchInterval: (query) =>
      query.state.data !== undefined && query.state.data.status === 'outline_ready' ? false : 2_000,
  });

  const story = storyQuery.data;
  const hero = story?.characters.find((character) => character.isPrimary);
  const variants = hero?.variants ?? [];
  const chosenVariant =
    variantId ?? variants.find((variant) => variant.selected)?.id ?? variants[0]?.id;

  const approve = async (): Promise<void> => {
    if (story === undefined || busy !== undefined) return;
    setBusy('approve');
    setActionError(undefined);
    try {
      if (hero !== undefined && chosenVariant !== undefined) {
        await api().stories.selectCharacterVariant({
          params: { storyId: story.id as string },
          body: { characterId: hero.id as string, variantId: chosenVariant, reuseForChild: true },
          headers: { 'idempotency-key': newIdempotencyKey('varyant') },
        });
      }
      const res = await api().stories.approveOutline({
        params: { storyId: story.id as string },
        body: { costAcknowledged: true },
        headers: { 'idempotency-key': newIdempotencyKey('kapi1') },
      });
      if (res.status !== 202) throw asApiError(res.body);
      router.replace({
        pathname: '/(onboarding)/uretim',
        params: { storyId: story.id as string, jobId: res.body.job.jobId as string },
      });
    } catch (error) {
      setActionError(toApiError(error));
      setBusy(undefined);
    }
  };

  const anotherAngle = async (): Promise<void> => {
    if (story === undefined || busy !== undefined) return;
    setBusy('reject');
    setActionError(undefined);
    try {
      const res = await api().stories.rejectOutline({
        params: { storyId: story.id as string },
        body: { regenerate: true, reasonTr: 'Ebeveyn başka bir açı istedi' },
        headers: { 'idempotency-key': newIdempotencyKey('baska-aci') },
      });
      if (res.status !== 202) throw asApiError(res.body);
      const jobId = res.body.job?.jobId;
      if (jobId !== undefined) {
        router.replace({
          pathname: '/(onboarding)/iskelet',
          params: {
            storyId: story.id as string,
            jobId: jobId as string,
            ...(toplamKredi !== undefined ? { toplamKredi } : {}),
          },
        });
      }
    } catch (error) {
      setActionError(toApiError(error));
      setBusy(undefined);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { padding: spacing.md, gap: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="label" tone="accent" style={styles.kicker}>
          TASLAK HAZIR — SON SÖZ SİZİN
        </Text>
        {storyQuery.isLoading || story === undefined ? (
          <Text variant="body" tone="muted">
            Taslak yükleniyor…
          </Text>
        ) : storyQuery.error != null ? (
          <ErrorBanner error={storyQuery.error} onRetry={() => void storyQuery.refetch()} />
        ) : (
          <>
            <Text variant="title" accessibilityRole="header">
              {story.outline?.titleTr ?? story.title ?? 'Taslak'}
            </Text>
            {story.outline?.lessonTr !== undefined && (
              <View
                style={{
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  gap: 2,
                }}
              >
                <Text variant="caption" tone="muted">
                  Bu masalın kalbi
                </Text>
                <Text variant="bodyStrong" style={{ color: colors.primary }}>
                  {story.outline.lessonTr}
                </Text>
              </View>
            )}

            {/* Karakter varyantları */}
            {variants.length > 0 && (
              <View
                onLayout={(event) => {
                  variantSectionY.current = event.nativeEvent.layout.y;
                }}
                style={{ gap: spacing.sm }}
              >
                <Text variant="heading" accessibilityRole="header">
                  Kahramanınızı seçin
                </Text>
                <Text variant="caption" tone="muted">
                  Üç çizimden birini seçin — kitabın her sayfasında bu kahraman olacak.
                </Text>
                <View style={[styles.variantRow, { gap: spacing.sm }]}>
                  {variants.map((variant, index) => (
                    <VariantCard
                      key={variant.id}
                      index={index}
                      url={variant.image.url}
                      selected={chosenVariant === variant.id}
                      onPress={() => {
                        setVariantId(variant.id);
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* 12 sahne */}
            <View style={{ gap: spacing.sm }}>
              <Text variant="heading" accessibilityRole="header">
                {`Hikayenin akışı (${String(story.outline?.scenes.length ?? 0)} sahne)`}
              </Text>
              {story.outline?.scenes.map((scene) => (
                <View
                  key={scene.pageNo}
                  style={[
                    styles.sceneRow,
                    {
                      gap: spacing.sm,
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: radius.sm,
                      padding: spacing.sm,
                    },
                  ]}
                >
                  <View style={[styles.sceneNoCircle, { backgroundColor: colors.surfaceRaised }]}>
                    <Text variant="label" style={{ color: colors.primary }}>
                      {scene.pageNo}
                    </Text>
                  </View>
                  <View style={styles.sceneBody}>
                    <Text variant="caption" style={styles.sceneText}>
                      {scene.summaryTr}
                    </Text>
                    <Text variant="caption" tone="accent">
                      {scene.emotion}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Maliyet + eylemler */}
            <NoticeBox
              tone="legal"
              titleTr={
                toplamKredi !== undefined
                  ? `Onaylarsanız ${toplamKredi} kredi düşer`
                  : 'Onaylarsanız kitap üretimi başlar'
              }
              bodyTr="Metinler yazılır, 12 sayfa + kapak çizilir. Beğenmezseniz şimdi vazgeçin — başka hiçbir ücret alınmaz."
            />

            {actionError !== undefined && <ErrorBanner error={actionError} />}

            <PrimaryButton
              label={busy === 'approve' ? 'Onaylanıyor…' : 'Devam et'}
              disabled={busy !== undefined}
              onPress={() => {
                void approve();
              }}
            />
            <View style={[styles.secondaryRow, { gap: spacing.sm }]}>
              <View style={styles.secondaryCell}>
                <SecondaryButton
                  label={busy === 'reject' ? 'Yenileniyor…' : 'Başka bir açı'}
                  disabled={busy !== undefined}
                  onPress={() => {
                    void anotherAngle();
                  }}
                />
              </View>
              <View style={styles.secondaryCell}>
                <SecondaryButton
                  label="Karakteri değiştir"
                  disabled={busy !== undefined}
                  onPress={() => {
                    scrollRef.current?.scrollTo({ y: variantSectionY.current, animated: true });
                  }}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VariantCard({
  index,
  url,
  selected,
  onPress,
}: {
  index: number;
  url: string;
  selected: boolean;
  onPress: () => void;
}): ReactNode {
  const { colors, radius } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.variantCard,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: radius.md,
          backgroundColor: selected ? colors.surfaceRaised : colors.surface,
        },
      ]}
    >
      {selected && (
        <View style={styles.variantCheck}>
          <SelectedCheck />
        </View>
      )}
      {failed ? (
        <View style={[styles.variantFallback, { backgroundColor: colors.surfaceMuted }]}>
          <Text variant="title" tone="muted">
            {String(index + 1)}
          </Text>
        </View>
      ) : (
        <Image
          accessibilityLabel={`Karakter çizimi ${String(index + 1)}`}
          source={{ uri: url }}
          style={[styles.variantImage, { backgroundColor: colors.surfaceMuted }]}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
      <Text
        variant="caption"
        center
        style={[
          styles.variantLabel,
          selected ? { color: colors.primary, fontWeight: '700' } : { color: colors.inkMuted },
        ]}
      >
        {selected ? '✓ Seçildi' : `Çizim ${String(index + 1)}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 48 },
  kicker: { letterSpacing: 1 },

  variantRow: { flexDirection: 'row' },
  variantCard: { flex: 1, borderWidth: 2, overflow: 'hidden' },
  variantCheck: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  variantImage: { width: '100%', aspectRatio: 1 },
  variantFallback: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantLabel: { paddingVertical: 6 },

  sceneRow: { flexDirection: 'row', borderWidth: 1, alignItems: 'flex-start' },
  sceneNoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneBody: { flex: 1, gap: 2 },
  sceneText: { fontSize: 14, lineHeight: 20 },

  secondaryRow: { flexDirection: 'row' },
  secondaryCell: { flex: 1 },
});
