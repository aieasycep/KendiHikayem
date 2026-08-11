import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import type { ApiError, VoiceProfile, VoiceStep } from '@kendihikayem/contract';
import { Button, Text } from '@kendihikayem/ui';

import { ErrorBanner, SecondaryButton } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';
import { SamplePlayer } from '../../../features/voice/SamplePlayer';
import { NightHeader, NightScreen } from '../../../features/wizard/NightFlow';
import { api, asApiError, newIdempotencyKey, toApiError } from '../../../lib/api';
import { queryClient } from '../../../lib/queryClient';

const PASSAGE_LABELS: [VoiceStep, string][] = [
  ['passage_1', '1 · Sakin anlatım'],
  ['passage_2', '2 · Heyecanlı'],
  ['passage_3', '3 · Fısıltıya yakın'],
  ['passage_4', '4 · Diyalog'],
];

/**
 * V08 — ÖNİZLEME, duygusal doğrulama (SPEC §7 adım 9). Gece stüdyo teması.
 *
 * The parent hears ~15 s of THEIR OWN voice saying their child's name.
 * Three exits, exactly as specified:
 *   [Harika, kaydet]      → accept → V09 (raw takes scheduled for +30 gün imha)
 *   [Yeniden kaydet]      → redo() everything → V05
 *   [Bir pasajı düzelt]   → redo({fromStep}) → only that passage again
 */
export default function Onizleme(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const profileId = flow.state.profileId;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [fixOpen, setFixOpen] = useState(false);

  useEffect(() => {
    if (profileId === undefined) router.replace('/(app)/ses');
  }, [profileId, router]);

  const profile = useQuery<VoiceProfile, ApiError>({
    queryKey: ['voiceProfile', profileId],
    enabled: profileId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().voice.getProfile({ params: { voiceProfileId: profileId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (err) {
        throw toApiError(err);
      }
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'processing' || query.state.data?.status === 'recording'
        ? 2_000
        : false,
  });

  const accept = async (): Promise<void> => {
    if (profileId === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api().voice.accept({
        params: { voiceProfileId: profileId },
        body: {},
        headers: { 'idempotency-key': newIdempotencyKey('ses-kabul') },
      });
      if (res.status !== 200) throw asApiError(res.body);
      await queryClient.invalidateQueries({ queryKey: ['voiceProfiles'] });
      router.replace('/(app)/ses/hazir');
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  };

  const redo = async (fromStep?: VoiceStep): Promise<void> => {
    if (profileId === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api().voice.redo({
        params: { voiceProfileId: profileId },
        body: fromStep !== undefined ? { fromStep } : {},
        headers: { 'idempotency-key': newIdempotencyKey('ses-tekrar') },
      });
      if (res.status !== 200) throw asApiError(res.body);
      flow.setScript(res.body);
      flow.clearFrom(fromStep);
      setBusy(false);
      if (fromStep === undefined || fromStep === 'consent_clip') {
        router.push('/(app)/ses/sesli-riza');
      } else {
        router.push(`/(app)/ses/pasaj/${fromStep.slice(-1)}`);
      }
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  };

  const ready = profile.data?.status === 'preview_ready' || profile.data?.status === 'ready';

  return (
    <NightScreen scroll testID="ses-onizleme">
      <NightHeader kickerTr="Ses Kaydı" titleTr="Sesinizi dinleyin" />
      <Text variant="body" style={styles.lead}>
        Aşağıdaki örnek, kayıtlarınızdan üretilen sesinizle seslendirildi — çocuğunuzun adı da
        içinde. Beğenirseniz kaydedin; beğenmezseniz dilediğiniz pasajı yenileyin.
      </Text>

      {profile.isLoading ? (
        <Text variant="caption" style={styles.subtle}>
          Önizleme yükleniyor…
        </Text>
      ) : profile.error != null ? (
        <ErrorBanner error={profile.error} onRetry={() => void profile.refetch()} />
      ) : !ready || profile.data === undefined ? (
        <Text variant="caption" style={styles.subtle}>
          Önizleme hâlâ hazırlanıyor… Bu ekran kendini yenileyecek.
        </Text>
      ) : (
        <>
          {profile.data.preview !== undefined ? (
            <SamplePlayer
              labelTr={`${profile.data.displayName} sesi — 15 saniyelik örnek`}
              sublabelTr="“…, hadi uyu artık. Yarın yeni bir maceraya çıkacağız.”"
              url={profile.data.preview.url}
            />
          ) : (
            <Text variant="caption" style={styles.subtle}>
              Önizleme dosyası bulunamadı; yine de kaydedebilirsiniz.
            </Text>
          )}

          {error !== undefined && <ErrorBanner error={error} />}

          <Button
            label={busy ? 'Kaydediliyor…' : 'Harika, kaydet'}
            disabled={busy}
            onPress={() => {
              void accept();
            }}
          />
          <SecondaryButton
            label="Yeniden kaydet (baştan)"
            disabled={busy}
            onPress={() => {
              void redo(undefined);
            }}
          />
          <SecondaryButton
            label="Bir pasajı düzelt"
            disabled={busy}
            onPress={() => {
              setFixOpen((value) => !value);
            }}
          />
          {fixOpen && (
            <View style={styles.fixBox}>
              <Text variant="label" style={styles.fixTitle}>
                Hangi pasajı yenilemek istersiniz?
              </Text>
              {PASSAGE_LABELS.map(([step, label]) => (
                <SecondaryButton
                  key={step}
                  label={label}
                  disabled={busy}
                  onPress={() => {
                    void redo(step);
                  }}
                />
              ))}
            </View>
          )}
        </>
      )}

      <Text variant="caption" style={styles.footnote}>
        Kaydettiğinizde ham kayıtlarınız 30 gün sonra otomatik imha edilir; ses profiliniz
        yalnızca sizin hesabınızda çalışır.
      </Text>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  lead: { color: 'rgba(232,224,212,0.9)' },
  subtle: { color: 'rgba(176,156,224,0.8)' },

  fixBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  fixTitle: { color: '#FFFFFF' },

  footnote: { color: 'rgba(255,255,255,0.45)' },
});
