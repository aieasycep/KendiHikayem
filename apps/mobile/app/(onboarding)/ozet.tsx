import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';
import { Text, useTheme } from '@kendihikayem/ui';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../components/ui';
import { useEstimate, useThemes } from '../../features/onboarding/catalogHooks';
import { ErrorBanner, StepBar } from '../../features/onboarding/components';
import { createStory } from '../../features/onboarding/createStory';
import { useWizardDraft } from '../../features/onboarding/draft';
import { newIdempotencyKey } from '../../lib/api';
import { useSession } from '../../lib/session';

/**
 * S06 — Özet + [Hikayemi Oluştur] (SPEC §11.2, 2:00).
 *
 * Guest users are sent to S07 (OTP) exactly at this moment — value first,
 * account second. Coming back verified (`?devam=1`) the creation fires
 * automatically so the parent does not press the button twice.
 *
 * The idempotency key is created ONCE per intent and kept in a ref: a retry
 * after a network error can never create two stories or charge twice.
 */
export default function Ozet(): ReactNode {
  const router = useRouter();
  const { devam } = useLocalSearchParams<{ devam?: string }>();
  const { draft } = useWizardDraft();
  const session = useSession();
  const themes = useThemes(draft.ageBand);
  const estimate = useEstimate('story_outline');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const intentKey = useRef<string | undefined>(undefined);
  const autoFired = useRef(false);
  /** Re-entrancy guard as a ref so `create` stays identity-stable. */
  const busyRef = useRef(false);

  const themeTitle =
    themes.data?.find((theme) => theme.code === draft.themeCode)?.titleTr ?? draft.themeCode ?? '—';
  const heroLabel = draft.heroIsChild ? `${draft.childName} (kendisi)` : draft.heroName;

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

  const onCreatePress = (): void => {
    if (session.phase !== 'user') {
      router.push({ pathname: '/(onboarding)/giris', params: { donus: 'olustur' } });
      return;
    }
    void create();
  };

  // Returning from S07 verified: fire the creation once, automatically.
  // `create` is useCallback-stable per draft; autoFired guards re-entry anyway.
  useEffect(() => {
    if (devam === '1' && session.phase === 'user' && !autoFired.current) {
      autoFired.current = true;
      void create();
    }
  }, [devam, session.phase, create]);

  return (
    <Screen>
      <StepBar step={5} total={5} labelTr="Yeni Masal · Özet" />
      <Title>{draft.childName === '' ? 'Masal özeti' : `${possessive(draft.childName)} masalı`}</Title>

      <Card>
        <SummaryRow labelTr="Kahraman" valueTr={heroLabel} />
        <SummaryRow labelTr="Yaş bandı" valueTr={`${draft.ageBand} yaş`} />
        <SummaryRow labelTr="Tema" valueTr={themeTitle} />
        <SummaryRow labelTr="Çizim stili" valueTr={draft.artStyleCode ?? '—'} />
        <SummaryRow labelTr="Uzunluk" valueTr={`${String(draft.pageCount)} sayfa`} last />
      </Card>

      <Card>
        <Heading>Nasıl ilerleyecek?</Heading>
        <Body>
          Önce 15-20 saniyede bir taslak hazırlarız: 12 sahnelik akış ve kahramanınızın üç
          farklı çizimi. Beğenirseniz onaylarsınız, kitap ancak o zaman üretilir.
        </Body>
        {estimate.data !== undefined && <CostNote creditsTr={String(estimate.data.credits)} />}
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
        disabled={busy}
        onPress={onCreatePress}
      />
      {session.phase !== 'user' && (
        <Caption>
          Devam etmek için telefonunuzu doğrulayacağız (~20 saniye). Şimdiye kadar yaptığınız
          her seçim hesabınıza aynen taşınır — hiçbir şey kaybolmaz.
        </Caption>
      )}
    </Screen>
  );
}

function SummaryRow({
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

function CostNote({ creditsTr }: { creditsTr: string }): ReactNode {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, padding: spacing.sm }}
    >
      <Text variant="label" style={{ color: colors.primary }}>
        {`Taslak: ${creditsTr} kredi · Beğenmezseniz başka ücret yok`}
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
});
