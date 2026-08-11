import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
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
 * S10 — Üretim beklemesi. Figma `StoryGenerating` BİREBİR: gece gökyüzü,
 * yüzen kitap, masalsı dönen mesajlar, mor→altın çubuk, en altta tasarımın
 * "uygulamadan ayrılsan da…" notu. İş bitince tasarımdaki gibi son mesaj
 * ("Masalın hazır! ✨") görünür ve hikaye kendiliğinden açılır.
 *
 * Gerçek durum kaybolmaz: `job.progress.labelTr` tasarımın alt satır yuvasında,
 * çubuk dolgusu gerçek adım oranında.
 */
export default function Uretim(): ReactNode {
  const router = useRouter();
  const { storyId, jobId } = useLocalSearchParams<{ storyId: string; jobId: string }>();
  const { job, error } = useJob(jobId);
  const opened = useRef(false);

  const done = job?.status === 'succeeded';
  const failed = job?.status === 'failed';
  const doneSteps = job?.steps.filter((step) => step.status === 'succeeded').length ?? 0;
  const totalSteps = job?.steps.length ?? 0;

  // Tasarım akışı: son mesaj kısa süre görünür, sonra sonuç ekranına geçilir.
  useEffect(() => {
    if (!done || opened.current) return undefined;
    const timer = setTimeout(() => {
      opened.current = true;
      router.replace(`/(app)/hikaye/${storyId ?? ''}`);
    }, 1400);
    return () => {
      clearTimeout(timer);
    };
  }, [done, router, storyId]);

  return (
    <NightScreen includeBottom scroll testID="uretim-bekleme">
      {failed ? (
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Üretim tamamlanamadı
          </Text>
          <ErrorBanner
            error={
              job.error ?? {
                code: 'INTERNAL',
                messageTr:
                  'Üretim tamamlanamadı ve krediniz iade edildi. Kitaplığınızdan tekrar deneyebilirsiniz.',
                retryable: true,
                traceId: 'yerel',
              }
            }
          />
          <SecondaryButton
            label="Kitaplığa dön"
            onPress={() => {
              router.replace('/(app)/kitaplik');
            }}
          />
        </>
      ) : error !== undefined && job === undefined ? (
        <>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            Kitabınız üretiliyor
          </Text>
          <ErrorBanner error={error} />
        </>
      ) : (
        <View style={styles.center}>
          <FloatingBook size={done ? 112 : 140} />
          <TaleMessages
            done={done}
            statusTr={done ? undefined : (job?.progress.labelTr ?? 'Kitabınız sıraya alındı…')}
          />
          {!done && (
            <NightProgress ratio={totalSteps > 0 ? doneSteps / totalSteps : 0.05} />
          )}
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
  center: { alignItems: 'center', gap: 40, paddingTop: 56 },
  leaveNote: { color: 'rgba(255,255,255,0.35)', marginTop: 'auto' },
});
