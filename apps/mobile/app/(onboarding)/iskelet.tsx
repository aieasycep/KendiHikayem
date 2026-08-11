import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@kendihikayem/ui';

import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
import {
  FloatingBook,
  NightProgress,
  NightScreen,
  TaleMessages,
} from '../../features/wizard/NightFlow';
import { useJob } from '../../lib/useJob';

/**
 * S08 — İskelet bekleme (SPEC §11.2 2:25). Figma `StoryGenerating` BİREBİR:
 * gece gökyüzü, yıldızlar, yüzen açık kitap, masalsı dönen mesajlar
 * ("Biraz yıldız tozu ekliyoruz…") ve mor→altın ilerleme çubuğu.
 *
 * Gerçek iş durumu kaybolmaz: `job.progress.labelTr` tasarımın alt satır
 * yuvasında ("Ege ve Kayıp Yıldız hazırlanıyor" yeri) gösterilir; çubuğun
 * dolgusu gerçek adım sayısından gelir. ⏸ waiting_approval'da S09'a geçilir.
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
          <FloatingBook size={140} />
          <TaleMessages statusTr={job?.progress.labelTr ?? 'Masalınız sıraya alındı…'} />
          <NightProgress ratio={totalSteps > 0 ? doneSteps / totalSteps : 0.05} />
        </View>
      )}

      <Text variant="caption" center style={styles.leaveNote}>
        Uygulamadan ayrılsan da masalın oluşturulmaya devam eder.
      </Text>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: '#FFFFFF' },
  center: { alignItems: 'center', gap: 40, paddingTop: 64 },
  leaveNote: { color: 'rgba(255,255,255,0.35)', marginTop: 'auto' },
});
