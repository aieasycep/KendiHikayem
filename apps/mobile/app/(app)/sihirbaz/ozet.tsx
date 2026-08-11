import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';

import { Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, spacing, typography } from '../../../constants/theme';
import {
  useEntitlements,
  useEstimate,
  useThemes,
} from '../../../features/onboarding/catalogHooks';
import { ErrorBanner, StepBar } from '../../../features/onboarding/components';
import { createStory } from '../../../features/onboarding/createStory';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { newIdempotencyKey } from '../../../lib/api';

/**
 * W07 — Özet + kredi maliyeti. Shows the outline cost NOW and the full cost
 * that will only be charged after ⏸ KAPI 1 approval, next to the parent's
 * live credit balance. Creation then joins the shared S08→S09→S10 track.
 */
export default function WizardOzet(): ReactNode {
  const router = useRouter();
  const { draft } = useWizardDraft();
  const themes = useThemes(draft.ageBand);
  const outlineEstimate = useEstimate('story_outline');
  const fillEstimate = useEstimate('story_fill');
  const entitlements = useEntitlements();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const intentKey = useRef<string | undefined>(undefined);
  const busyRef = useRef(false);

  const themeTitle =
    themes.data?.find((theme) => theme.code === draft.themeCode)?.titleTr ?? draft.themeCode ?? '—';
  const heroLabel = draft.heroIsChild ? `${draft.childName} (kendisi)` : draft.heroName;
  const balance = entitlements.data?.credits;
  const outlineCredits = outlineEstimate.data?.credits;
  const fillCredits = fillEstimate.data?.credits;
  const insufficient =
    balance !== undefined && outlineCredits !== undefined && balance < outlineCredits;

  const create = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    intentKey.current ??= newIdempotencyKey('hikaye');
    try {
      const created = await createStory(draft, intentKey.current);
      router.replace({
        pathname: '/(onboarding)/iskelet',
        params: {
          storyId: created.storyId,
          jobId: created.job.jobId as string,
          toplamKredi: String(created.fullCostPreview.credits),
        },
      });
    } catch (err) {
      setError(err as ApiError);
      busyRef.current = false;
      setBusy(false);
    }
  }, [draft, router]);

  return (
    <Screen>
      <StepBar step={7} total={7} labelTr="Adım 7 / 7 — Özet" />
      <Title>
        {draft.childName === '' ? 'Masal özeti' : `${possessive(draft.childName)} yeni masalı`}
      </Title>

      <Card>
        <Row labelTr="Kahraman" valueTr={heroLabel} />
        {draft.reuseCharacterId !== undefined && (
          <Row labelTr="Karakter" valueTr="Önceki kitaptaki kahraman ⭐" />
        )}
        <Row labelTr="Yaş bandı" valueTr={`${draft.ageBand} yaş`} />
        <Row labelTr="Tema" valueTr={themeTitle} />
        <Row labelTr="Çizim stili" valueTr={draft.artStyleCode ?? '—'} />
        <Row labelTr="Uzunluk" valueTr={`${String(draft.pageCount)} sayfa`} />
        {draft.lessonHintTr !== undefined && <Row labelTr="Değer" valueTr={draft.lessonHintTr} />}
        <Row labelTr="Ses" valueTr={draft.voiceChoice?.labelTr ?? 'Sonra seçilecek'} />
        {draft.religiousOptIn && <Row labelTr="Dini içerik" valueTr="Açık (siz seçtiniz)" />}
      </Card>

      <Card>
        <Heading>Kredi maliyeti</Heading>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Şimdi (taslak)</Text>
          <Text style={styles.costValue}>
            {outlineCredits !== undefined ? `${String(outlineCredits)} kredi` : '…'}
          </Text>
        </View>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Onaylarsanız (kitap + görseller)</Text>
          <Text style={styles.costValue}>
            {fillCredits !== undefined ? `+${String(fillCredits)} kredi` : '…'}
          </Text>
        </View>
        <View style={[styles.costRow, styles.balanceRow]}>
          <Text style={styles.costLabel}>Bakiyeniz</Text>
          <Text style={[styles.costValue, insufficient && styles.balanceLow]}>
            {balance !== undefined ? `${String(balance)} kredi` : '…'}
          </Text>
        </View>
        <Caption>
          Taslağı beğenmezseniz onay vermezsiniz; kitap üretimi hiç başlamaz ve yalnızca taslak
          ücreti düşer.
        </Caption>
      </Card>

      {error !== undefined && (
        <ErrorBanner
          error={error}
          onRetry={() => {
            void create();
          }}
        />
      )}

      <PrimaryButton
        label={busy ? 'Taslak hazırlanıyor…' : 'Hikayemi Oluştur'}
        disabled={busy || insufficient}
        onPress={() => {
          void create();
        }}
      />
      {insufficient && (
        <Caption>
          Krediniz taslak için yetmiyor. Ayarlar → Hesap ekranından kredi paketi alabilirsiniz.
        </Caption>
      )}
    </Screen>
  );
}

function Row({ labelTr, valueTr }: { labelTr: string; valueTr: string }): ReactNode {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{labelTr}</Text>
      <Text style={styles.rowValue}>{valueTr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  rowLabel: { ...typography.label, color: colors.inkMuted },
  rowValue: { ...typography.body, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  balanceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 8,
  },
  costLabel: { ...typography.caption, fontSize: 14, color: colors.inkMuted },
  costValue: { ...typography.label, fontSize: 16, color: colors.ink },
  balanceLow: { color: '#B42318' },
});
