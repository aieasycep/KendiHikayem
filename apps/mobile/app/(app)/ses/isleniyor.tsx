import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';

import { Body, Caption, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { ErrorBanner, SecondaryButton } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { useVoiceFlow } from '../../../features/voice/flow';
import { api, asApiError, newIdempotencyKey, toApiError } from '../../../lib/api';
import { useJob } from '../../../lib/useJob';

/**
 * V07 — İşleniyor (SPEC §7 adım 8). Fires `POST /submit` exactly once
 * (idempotency key in a ref), then tracks the `voice_create` job through the
 * shared `useJob` polling hook. The child's name is passed so the V08 preview
 * says "Elif, hadi uyu artık…" — the emotional payoff of the whole flow.
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
    <Screen>
      <Title>Sesiniz oluşturuluyor</Title>
      <Body>
        Bu yaklaşık yarım dakika sürer. Kayıtlarınız birleştiriliyor, ses profiliniz üretiliyor
        ve çocuğunuz için kısa bir örnek cümle seslendiriliyor.
      </Body>

      {error !== undefined ? (
        <>
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
        <ErrorBanner error={jobError} />
      ) : (
        <View style={styles.progressCard}>
          <Text style={styles.stepNow}>{job?.progress.labelTr ?? 'Kayıtlar sıraya alındı…'}</Text>
          <View style={styles.stepList}>
            {job?.steps.map((step) => (
              <View key={step.stepKey} style={styles.stepRow}>
                <Text style={styles.stepIcon}>
                  {step.status === 'succeeded' ? '✓' : step.status === 'running' ? '●' : '○'}
                </Text>
                <Text
                  style={[
                    styles.stepText,
                    step.status === 'succeeded' && styles.stepDone,
                    step.status === 'running' && styles.stepActive,
                  ]}
                >
                  {step.stepKey}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Caption>
        Ham kayıtlarınız profil onaylandıktan 30 gün sonra otomatik imha edilir; bu süre yalnızca
        kalite itirazları içindir.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  stepNow: { ...typography.heading, color: colors.primary },
  stepList: { gap: 6 },
  stepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  stepIcon: { width: 18, ...typography.label, color: colors.accent },
  stepText: { ...typography.caption, fontSize: 14, color: colors.inkMuted },
  stepDone: { color: colors.accent },
  stepActive: { color: colors.ink, fontWeight: '700' },
});
