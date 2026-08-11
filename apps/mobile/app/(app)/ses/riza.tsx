import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { ApiError, VoiceRelation } from '@kendihikayem/contract';
import { Input, Text, useTheme } from '@kendihikayem/ui';

import { Body, Card, Heading, PrimaryButton, Screen, Title, Caption } from '../../../components/ui';
import { Chip, ChipRow, ErrorBanner, StepBar } from '../../../features/onboarding/components';
import { recordConsent, useLegalDocument } from '../../../features/voice/consent';
import { useVoiceFlow } from '../../../features/voice/flow';
import { api, asApiError, newIdempotencyKey, toApiError } from '../../../lib/api';
import { refreshMe } from '../../../lib/session';

/**
 * V03 — AÇIK RIZA (SPEC §7 adım 3). Two SEPARATE, UN-PRECHECKED boxes:
 *   ☐ biyometrik işleme   ☐ yurt dışına aktarım
 * [Devam] stays disabled until BOTH are checked. Each box produces its own
 * `POST /v1/consents` with the sha256 of the document shown — blanket consent
 * is impossible. Then the profile draft is opened (`voice.createProfile`).
 */
export default function Riza(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const biyometrikDoc = useLegalDocument('acik_riza_ses_biyometrik');
  const yurtdisiDoc = useLegalDocument('acik_riza_yurtdisi');

  const [biyometrikChecked, setBiyometrikChecked] = useState(false);
  const [yurtdisiChecked, setYurtdisiChecked] = useState(false);
  const [relation, setRelation] = useState<VoiceRelation>('anne');
  const [displayName, setDisplayName] = useState('Anne');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);

  const docsReady = biyometrikDoc.data !== undefined && yurtdisiDoc.data !== undefined;
  const canContinue =
    biyometrikChecked && yurtdisiChecked && docsReady && displayName.trim().length > 0 && !busy;

  const proceed = async (): Promise<void> => {
    if (!canContinue || biyometrikDoc.data === undefined || yurtdisiDoc.data === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      // Her konu AYRI çağrı — battaniye rıza sözleşme düzeyinde imkânsız.
      await recordConsent({
        subject: 'ses_biyometrik',
        granted: true,
        document: biyometrikDoc.data,
        method: 'explicit_checkbox',
      });
      await recordConsent({
        subject: 'yurtdisi_aktarim',
        granted: true,
        document: yurtdisiDoc.data,
        method: 'explicit_checkbox',
      });
      await refreshMe();

      const res = await api().voice.createProfile({
        body: { displayName: displayName.trim(), relation },
        headers: { 'idempotency-key': newIdempotencyKey('ses-profil') },
      });
      if (res.status !== 201) throw asApiError(res.body);
      if (res.body.consentRequired.length > 0) {
        setError(
          asApiError({
            code: 'CONSENT_REQUIRED',
            messageTr:
              'İzin kayıtları henüz tamamlanmadı. Kutuları işaretleyip tekrar deneyin.',
            retryable: true,
            traceId: 'riza',
          }),
        );
        setBusy(false);
        return;
      }
      flow.setProfile(res.body.profile.id as string, displayName.trim(), relation);
      router.push('/(app)/ses/ortam');
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <StepBar step={3} total={4} labelTr="Sesinizi tanıtın · Açık rıza" />
      <Title>Açık Rıza</Title>
      <Body>
        İki ayrı konu için ayrı ayrı onayınızı istiyoruz. Kutular boş gelir; ikisini de siz
        işaretlemeden devam edilemez.
      </Body>

      <ConsentBox
        checked={biyometrikChecked}
        loading={biyometrikDoc.isLoading}
        labelTr="Biyometrik nitelikte ses verimin, çocuğuma özel masalların seslendirilmesi amacıyla işlenmesine açık rıza veriyorum."
        versionTr={biyometrikDoc.data !== undefined ? `Metin sürümü ${biyometrikDoc.data.version}` : undefined}
        onToggle={() => {
          setBiyometrikChecked((value) => !value);
        }}
      />
      <ConsentBox
        checked={yurtdisiChecked}
        loading={yurtdisiDoc.isLoading}
        labelTr="Ses verimin, ses üretim sağlayıcısının ABD’deki sunucularına aktarılmasına, risklerini bilerek açık rıza veriyorum."
        versionTr={yurtdisiDoc.data !== undefined ? `Metin sürümü ${yurtdisiDoc.data.version}` : undefined}
        onToggle={() => {
          setYurtdisiChecked((value) => !value);
        }}
      />

      <Card>
        <Heading>Bu ses kimin?</Heading>
        <ChipRow>
          {(
            [
              ['anne', 'Anne'],
              ['baba', 'Baba'],
              ['diger', 'Diğer'],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              selected={relation === value}
              onPress={() => {
                setRelation(value);
                if (value !== 'diger') setDisplayName(label);
              }}
            />
          ))}
        </ChipRow>
        <Input
          label="Profil adı"
          maxLength={40}
          onChangeText={setDisplayName}
          placeholder="Örn. Anne"
          value={displayName}
        />
      </Card>

      {error !== undefined && <ErrorBanner error={error} />}

      <PrimaryButton
        label={busy ? 'Kaydediliyor…' : 'Devam et'}
        disabled={!canContinue}
        onPress={() => {
          void proceed();
        }}
      />
      <Caption>
        İzninizi dilediğiniz an Ayarlar → Gizlilik ve İzinler ekranından geri alabilirsiniz;
        sesiniz sağlayıcıdan da silinir.
      </Caption>
    </Screen>
  );
}

/**
 * Ön-işaretsiz onay kutusu — başlangıç durumu HER ZAMAN dışarıdan (false)
 * gelir; bileşenin varsayılanı yoktur. Tasarım dili: 2 px kenarlık, işaretli
 * durumda lavanta zemin + mor kutu.
 */
function ConsentBox({
  checked,
  loading,
  labelTr,
  versionTr,
  onToggle,
}: {
  checked: boolean;
  loading: boolean;
  labelTr: string;
  versionTr?: string;
  onToggle: () => void;
}): ReactNode {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={labelTr}
      disabled={loading}
      onPress={onToggle}
      style={[
        styles.consentBox,
        {
          gap: spacing.sm,
          backgroundColor: checked ? colors.surfaceRaised : colors.surface,
          borderColor: checked ? colors.primary : colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? colors.primary : colors.inkMuted,
            backgroundColor: checked ? colors.primary : colors.surface,
          },
        ]}
      >
        {checked && (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M20 6L9 17l-5-5"
              stroke={colors.inkOnPrimary}
              strokeWidth={3.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </View>
      <View style={styles.consentBody}>
        <Text variant="caption" style={styles.consentText}>
          {labelTr}
        </Text>
        {versionTr !== undefined && (
          <Text variant="caption" tone="muted" style={styles.consentVersion}>
            {versionTr}
          </Text>
        )}
        {loading && (
          <Text variant="caption" tone="muted" style={styles.consentVersion}>
            Metin yükleniyor…
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  consentBox: { flexDirection: 'row', borderWidth: 2 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentBody: { flex: 1, gap: 4 },
  consentText: { fontSize: 14, lineHeight: 21 },
  consentVersion: { fontSize: 12, lineHeight: 16 },
});
