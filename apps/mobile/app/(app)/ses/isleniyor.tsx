import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';
import { Text } from '@kendihikayem/ui';

import { ErrorBanner, SecondaryButton } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { useVoiceFlow } from '../../../features/voice/flow';
import { NightScreen, ProcessingRing } from '../../../features/wizard/NightFlow';
import { api, asApiError, newIdempotencyKey, toApiError } from '../../../lib/api';
import { useJob } from '../../../lib/useJob';

/**
 * V07 — İşleniyor (SPEC §7 adım 8). Gece "Sesin hazırlanıyor…" ekranı (Figma
 * `VoiceStudio` processing). Fires `POST /submit` exactly once (idempotency key
 * in a ref), then tracks the `voice_create` job through the shared `useJob`
 * polling hook. The child's name is passed so the V08 preview says
 * "Elif, hadi uyu artık…" — the emotional payoff of the whole flow.
 */
export default function Isleniyor(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const { draft } = useWizardDraft();
  const { yeniden } = useLocalSearchParams<{ yeniden?: string }>();

  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const submitted = useRef(false);
  const intentKey = useRef(newIdempotencyKey('ses-uret'));

  const profileId = flow.state.profileId;
  const { job, error: jobError } = useJob(jobId);

  useEffect(() => {
    if (profileId === undefined) {
      router.replace('/(app)/ses');
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    void (async () => {
      try {
        const childName = draft.childName.trim();
        const res = await api().voice.submit({
          params: { voiceProfileId: profileId },
          body: childName !== '' ? { previewChildName: childName } : {},
          headers: { 'idempotency-key': intentKey.current },
        });
        if (res.status !== 202) throw asApiError(res.body);
        setJobId(res.body.job.jobId as string);
      } catch (err) {
        setError(toApiError(err));
      }
    })();
  }, [profileId, draft.childName, router, yeniden]);

  useEffect(() => {
    if (job?.status === 'succeeded') router.replace('/(app)/ses/onizleme');
  }, [job?.status, router]);

  const failed = job?.status === 'failed';

  return (
    <NightScreen scroll testID="ses-isleniyor">
      {error !== undefined ? (
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Sesiniz oluşturulamadı
          </Text>
          <ErrorBanner error={error} />
          <SecondaryButton
            label="Pasajlara dön"
            onPress={() => {
              router.replace('/(app)/ses/pasaj/1');
            }}
          />
        </>
      ) : failed ? (
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Sesiniz oluşturulamadı
          </Text>
          <ErrorBanner
            error={
              job.error ?? {
                code: 'VOICE_QUALITY_LOW',
                messageTr:
                  'Ses profili üretilemedi. Pasajları sessiz bir ortamda yeniden kaydetmeyi deneyin.',
                retryable: false,
                traceId: 'yerel',
              }
            }
          />
          <SecondaryButton
            label="Pasajlara dön"
            onPress={() => {
              router.replace('/(app)/ses/pasaj/1');
            }}
          />
        </>
      ) : jobError !== undefined && job === undefined ? (
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Sesiniz oluşturuluyor
          </Text>
          <ErrorBanner error={jobError} />
        </>
      ) : (
        <View style={styles.center}>
          <ProcessingRing />
          <View style={styles.messages}>
            <Text variant="heading" center style={styles.stepNow} accessibilityLiveRegion="polite">
              Sesin hazırlanıyor…
            </Text>
            <Text variant="caption" center style={styles.subtle}>
              {job?.progress.labelTr ?? 'Hazır olduğunda sana haber vereceğiz.'}
            </Text>
          </View>
        </View>
      )}

      <Text variant="caption" center style={styles.footnote}>
        Ham kayıtlarınız profil onaylandıktan 30 gün sonra otomatik imha edilir; bu süre yalnızca
        kalite itirazları içindir.
      </Text>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: '#FFFFFF' },
  center: { alignItems: 'center', gap: 24, paddingTop: 96 },
  messages: { gap: 8, paddingHorizontal: 8 },
  /* Figma processing: Fraunces 24/600 beyaz. */
  stepNow: { color: '#FFFFFF', fontSize: 24, lineHeight: 32 },
  subtle: { color: 'rgba(176,156,224,0.7)' },

  footnote: { color: 'rgba(255,255,255,0.45)', marginTop: 8 },
});
