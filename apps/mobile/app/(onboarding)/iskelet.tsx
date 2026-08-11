import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@kendihikayem/ui';

import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
import { FloatingBook, NightScreen } from '../../features/wizard/NightFlow';
import { useJob } from '../../lib/useJob';

/**
 * S08 — İskelet bekleme (12–20 sn, SPEC §11.2 2:25). Figma `StoryGenerating`
 * taşıması: gece gökyüzü, yıldızlar, yüzen açık kitap.
 *
 * No spinner theatre, no fake percentages: `progress.labelTr` is the REAL step
 * ("12 sahne sıraya diziliyor") polled from `GET /v1/jobs/:id` via the shared
 * `useJob` hook — tasarımdaki hazır mesaj dizisi yerine işin gerçek adı basılır.
 * When the job parks at ⏸ waiting_approval we hand over to S09.
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
  const doneSteps = job?.steps.filter((step) => step.status === 'succeeded').length ?? 0;
  const totalSteps = job?.steps.length ?? 0;

  return (
    <NightScreen includeBottom scroll testID="iskelet-bekleme">
      {job?.status === 'failed' ? (
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Taslak hazırlanamadı
          </Text>
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
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Taslağınız hazırlanıyor
          </Text>
          <ErrorBanner error={error} />
        </>
      ) : (
        <View style={styles.center}>
          <FloatingBook />

          <View style={styles.messages}>
            <Text variant="heading" center style={styles.stepNow} accessibilityLiveRegion="polite">
              {job?.progress.labelTr ?? 'Masalınız sıraya alındı…'}
            </Text>
            <Text variant="caption" center style={styles.subtle}>
              {etaSec !== undefined
                ? `Tahmini kalan süre: ${String(etaSec)} saniye`
                : 'Bu genellikle 15-20 saniye sürer.'}
            </Text>
          </View>

          {/* Gerçek iş adımları — yüzde değil, ne olduğu */}
          {totalSteps > 0 && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { flex: Math.max(doneSteps, 0.05) }]} />
                <View style={{ flex: Math.max(totalSteps - doneSteps, 0.05) }} />
              </View>
            </View>
          )}
          <StepList
            steps={(job?.steps ?? []).map((step) => ({ key: step.stepKey, status: step.status }))}
          />
        </View>
      )}

      <Text variant="caption" center style={styles.leaveNote}>
        Taslağı beğenmezseniz ücret alınmaz. Uygulamadan ayrılsanız da masalınız hazırlanmaya
        devam eder.
      </Text>
    </NightScreen>
  );
}

/** Gece renklerinde iş adımı listesi (✓ / ● / ○). */
function StepList({
  steps,
}: {
  steps: { key: string; status: 'pending' | 'running' | 'succeeded' | 'failed' | string }[];
}): ReactNode {
  const { colors } = useTheme();
  if (steps.length === 0) return null;
  return (
    <View style={styles.stepList}>
      {steps.map((step) => (
        <View key={step.key} style={styles.stepRow}>
          <Text
            variant="label"
            style={[
              styles.stepIcon,
              { color: step.status === 'succeeded' ? colors.success : colors.inkMuted },
            ]}
          >
            {step.status === 'succeeded' ? '✓' : step.status === 'running' ? '●' : '○'}
          </Text>
          <Text
            variant="caption"
            style={{
              color:
                step.status === 'running'
                  ? colors.ink
                  : step.status === 'succeeded'
                    ? colors.success
                    : colors.inkMuted,
              fontWeight: step.status === 'running' ? '700' : '400',
            }}
          >
            {step.key}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: '#FFFFFF' },
  center: { alignItems: 'center', gap: 28, paddingTop: 48 },
  messages: { gap: 8, paddingHorizontal: 8 },
  stepNow: { color: '#FFFFFF', fontSize: 22, lineHeight: 30, minHeight: 60 },
  subtle: { color: 'rgba(176,156,224,0.8)' },

  progressWrap: { width: '100%', maxWidth: 280 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: {
    backgroundColor: 'rgba(255, 220, 150, 0.9)',
    borderRadius: 2,
  },

  stepList: { gap: 6, alignSelf: 'stretch', paddingHorizontal: 16 },
  stepRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stepIcon: { width: 18 },

  leaveNote: { color: 'rgba(255,255,255,0.45)', marginTop: 'auto' },
});
