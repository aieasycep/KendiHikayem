import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiError, VoiceRelation } from '@kendihikayem/contract';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { Chip, ChipRow, ErrorBanner } from '../../../features/onboarding/components';
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
        <TextInput
          accessibilityLabel="Ses profili adı"
          maxLength={40}
          onChangeText={setDisplayName}
          placeholder="Profil adı (örn. Anne)"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
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
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      disabled={loading}
      onPress={onToggle}
      style={[styles.consentBox, checked && styles.consentBoxChecked]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxMark}>✓</Text>}
      </View>
      <View style={styles.consentBody}>
        <Text style={styles.consentText}>{labelTr}</Text>
        {versionTr !== undefined && <Text style={styles.consentVersion}>{versionTr}</Text>}
        {loading && <Text style={styles.consentVersion}>Metin yükleniyor…</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  consentBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  consentBoxChecked: { borderColor: colors.accent, backgroundColor: '#F0F8F5' },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxMark: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  consentBody: { flex: 1, gap: 4 },
  consentText: { ...typography.caption, fontSize: 14, lineHeight: 21, color: colors.ink },
  consentVersion: { ...typography.caption, fontSize: 12, color: colors.inkMuted },

  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
});
