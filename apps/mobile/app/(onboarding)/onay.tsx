import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import type { ApiError, Story } from '@kendihikayem/contract';

import { PrimaryButton } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>TASLAK HAZIR — SON SÖZ SİZİN</Text>
        {storyQuery.isLoading || story === undefined ? (
          <Text style={styles.waiting}>Taslak yükleniyor…</Text>
        ) : storyQuery.error != null ? (
          <ErrorBanner error={storyQuery.error} onRetry={() => void storyQuery.refetch()} />
        ) : (
          <>
            <Text style={styles.title}>{story.outline?.titleTr ?? story.title ?? 'Taslak'}</Text>
            {story.outline?.lessonTr !== undefined && (
              <View style={styles.lessonBox}>
                <Text style={styles.lessonLabel}>Bu masalın kalbi</Text>
                <Text style={styles.lessonText}>{story.outline.lessonTr}</Text>
              </View>
            )}

            {/* Karakter varyantları */}
            {variants.length > 0 && (
              <View
                onLayout={(event) => {
                  variantSectionY.current = event.nativeEvent.layout.y;
                }}
                style={styles.section}
              >
                <Text style={styles.sectionTitle}>Kahramanınızı seçin</Text>
                <Text style={styles.sectionHint}>
                  Üç çizimden birini seçin — kitabın her sayfasında bu kahraman olacak.
                </Text>
                <View style={styles.variantRow}>
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
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {`Hikayenin akışı (${String(story.outline?.scenes.length ?? 0)} sahne)`}
              </Text>
              {story.outline?.scenes.map((scene) => (
                <View key={scene.pageNo} style={styles.sceneRow}>
                  <Text style={styles.sceneNo}>{scene.pageNo}</Text>
                  <View style={styles.sceneBody}>
                    <Text style={styles.sceneText}>{scene.summaryTr}</Text>
                    <Text style={styles.sceneEmotion}>{scene.emotion}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Maliyet + eylemler */}
            <View style={styles.costBox}>
              <Text style={styles.costTitle}>
                {toplamKredi !== undefined
                  ? `Onaylarsanız ${toplamKredi} kredi düşer`
                  : 'Onaylarsanız kitap üretimi başlar'}
              </Text>
              <Text style={styles.costHint}>
                Metinler yazılır, 12 sayfa + kapak çizilir. Beğenmezseniz şimdi vazgeçin —
                başka hiçbir ücret alınmaz.
              </Text>
            </View>

            {actionError !== undefined && <ErrorBanner error={actionError} />}

            <PrimaryButton
              label={busy === 'approve' ? 'Onaylanıyor…' : 'Devam et'}
              disabled={busy !== undefined}
              onPress={() => {
                void approve();
              }}
            />
            <View style={styles.secondaryRow}>
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
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.variantCard, selected && styles.variantSelected]}
    >
      {failed ? (
        <View style={styles.variantFallback}>
          <Text style={styles.variantFallbackText}>{String(index + 1)}</Text>
        </View>
      ) : (
        <Image
          accessibilityLabel={`Karakter çizimi ${String(index + 1)}`}
          source={{ uri: url }}
          style={styles.variantImage}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
      <Text style={[styles.variantLabel, selected && styles.variantLabelSelected]}>
        {selected ? '✓ Seçildi' : `Çizim ${String(index + 1)}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  kicker: { ...typography.label, color: colors.accent, letterSpacing: 1 },
  waiting: { ...typography.body, color: colors.inkMuted },
  title: { ...typography.title, color: colors.ink },
  lessonBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  lessonLabel: { ...typography.caption, color: colors.inkMuted },
  lessonText: { ...typography.body, color: colors.ink, fontWeight: '600' },

  section: { gap: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.ink },
  sectionHint: { ...typography.caption, color: colors.inkMuted },

  variantRow: { flexDirection: 'row', gap: spacing.sm },
  variantCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  variantSelected: { borderColor: colors.primary },
  variantImage: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceMuted },
  variantFallback: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantFallbackText: { ...typography.title, color: colors.inkMuted },
  variantLabel: {
    ...typography.caption,
    textAlign: 'center',
    paddingVertical: 6,
    color: colors.inkMuted,
  },
  variantLabelSelected: { color: colors.primary, fontWeight: '700' },

  sceneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  sceneNo: {
    ...typography.label,
    color: colors.primary,
    width: 24,
    textAlign: 'center',
  },
  sceneBody: { flex: 1, gap: 2 },
  sceneText: { ...typography.caption, fontSize: 14, lineHeight: 20, color: colors.ink },
  sceneEmotion: { ...typography.caption, color: colors.accent },

  costBox: {
    backgroundColor: '#FFF1E6',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  costTitle: { ...typography.label, fontSize: 16, color: colors.primary },
  costHint: { ...typography.caption, color: colors.ink },

  secondaryRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryCell: { flex: 1 },
});
