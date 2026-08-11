import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Caption, Screen, Title } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
import { useJob } from '../../lib/useJob';

/**
 * S08 — İskelet bekleme (12–20 sn, SPEC §11.2 2:25).
 *
 * No spinner theatre, no fake percentages: `progress.labelTr` is the REAL step
 * ("12 sahne sıraya diziliyor") polled from `GET /v1/jobs/:id` via the shared
 * `useJob` hook. When the job parks at ⏸ waiting_approval we hand over to S09.
 */
export default function Iskelet(): ReactNode {
  const router = useRouter();
  const { storyId, jobId, toplamKredi } = useLocalSearchParams<{
    storyId: string;
    jobId: string;
    toplamKredi?: string;
  }>();
  const { job, error, isLoading } = useJob(jobId);

  useEffect(() => {
    if (job === undefined || storyId === undefined) return;
    if (job.status === 'waiting_approval' || job.status === 'succeeded') {
      router.replace({
        pathname: '/(onboarding)/onay',
        params: { storyId, ...(toplamKredi !== undefined ? { toplamKredi } : {}) },
      });
    }
  }, [job, router, storyId, toplamKredi]);

  const etaSec = job?.etaMs !== undefined ? Math.max(1, Math.round(job.etaMs / 1000)) : undefined;

  return (
    <Screen>
      <Title>Taslağınız hazırlanıyor</Title>
      <Body>Bu genellikle 15-20 saniye sürer. Taslağı beğenmezseniz ücret alınmaz.</Body>

      {job?.status === 'failed' ? (
        <>
          <ErrorBanner
            error={
              job.error ?? {
                code: 'INTERNAL',
                messageTr:
                  'Taslak üretimi başarısız oldu; krediniz iade edildi. Özetten tekrar deneyin.',
                retryable: true,
                traceId: 'yerel',
              }
            }
          />
          <SecondaryButton
            label="Özete dön"
            onPress={() => {
              router.replace('/(onboarding)/ozet');
            }}
          />
        </>
      ) : error !== undefined && job === undefined && !isLoading ? (
        <ErrorBanner error={error} />
      ) : (
        <View style={styles.progressCard}>
          <Text style={styles.stepNow}>{job?.progress.labelTr ?? 'Sıraya alındı…'}</Text>
          {etaSec !== undefined && (
            <Caption>{`Tahmini kalan süre: ${String(etaSec)} saniye`}</Caption>
          )}
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
        Birazdan 12 sahnelik akışı ve kahramanınızın üç çizimini göreceksiniz; kitabın kendisi
        ancak sizin onayınızla üretilir.
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
