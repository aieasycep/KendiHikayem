import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';
import { Text, useTheme } from '@kendihikayem/ui';

import { Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
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
      <StepBar step={7} total={7} labelTr="Yeni Hikâye · Özet" />
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
        {draft.religiousOptIn && <Row labelTr="Dini içerik" valueTr="Açık (siz seçtiniz)" last />}
      </Card>

      <Card>
        <Heading>Kredi maliyeti</Heading>
        <CostRow
          labelTr="Şimdi (taslak)"
          valueTr={outlineCredits !== undefined ? `${String(outlineCredits)} kredi` : '…'}
        />
        <CostRow
          labelTr="Onaylarsanız (kitap + görseller)"
          valueTr={fillCredits !== undefined ? `+${String(fillCredits)} kredi` : '…'}
        />
        <CostRow
          labelTr="Bakiyeniz"
          valueTr={balance !== undefined ? `${String(balance)} kredi` : '…'}
          danger={insufficient}
          divider
        />
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
        label={busy ? 'Taslak hazırlanıyor…' : 'Masalımı Oluştur ✨'}
        disabled={busy || insufficient}
        onPress={() => {
          void create();
        }}
      />
      <Caption>Yaklaşık 20–40 saniye sürebilir.</Caption>
      {insufficient && (
        <Caption>
          Krediniz taslak için yetmiyor. Ayarlar → Hesap ekranından kredi paketi alabilirsiniz.
        </Caption>
      )}
    </Screen>
  );
}

function Row({
  labelTr,
  valueTr,
  last = false,
}: {
  labelTr: string;
  valueTr: string;
  last?: boolean;
}): ReactNode {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text variant="label" tone="muted">
        {labelTr}
      </Text>
      <Text variant="bodyStrong" style={styles.rowValue}>
        {valueTr}
      </Text>
    </View>
  );
}

function CostRow({
  labelTr,
  valueTr,
  danger = false,
  divider = false,
}: {
  labelTr: string;
  valueTr: string;
  danger?: boolean;
  divider?: boolean;
}): ReactNode {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.costRow,
        divider && { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 8 },
      ]}
    >
      <Text variant="caption" tone="muted" style={styles.costLabel}>
        {labelTr}
      </Text>
      <Text variant="label" tone={danger ? 'danger' : 'default'}>
        {valueTr}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  rowValue: { flexShrink: 1, textAlign: 'right' },

  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  costLabel: { fontSize: 14, lineHeight: 19, flexShrink: 1 },
});
