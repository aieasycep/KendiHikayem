import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@kendihikayem/ui';

import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
import { FloatingBook, NightScreen } from '../../features/wizard/NightFlow';
import { useJob } from '../../lib/useJob';

/**
 * S10 — Üretim + atlanabilir ses köprüsü (SPEC §11.2, 3:00). Gece gökyüzü
 * deneyimi (Figma `StoryGenerating`) — kitap üretilirken ekran masal gibi.
 *
 * The wait is converted into value twice:
 *  1. Progress text says WHAT is happening ("Elif'in odası çiziliyor"), never a %.
 *  2. A skippable card invites the parent to record their voice — the single best
 *     use of these ~90 seconds. Skipping it costs nothing; voice stays optional.
 */
export default function Uretim(): ReactNode {
  const router = useRouter();
  const { storyId, jobId } = useLocalSearchParams<{ storyId: string; jobId: string }>();
  const { job, error } = useJob(jobId);
  const [bridgeDismissed, setBridgeDismissed] = useState(false);

  const done = job?.status === 'succeeded';
  const failed = job?.status === 'failed';
  const doneSteps = job?.steps.filter((step) => step.status === 'succeeded').length ?? 0;
  const totalSteps = job?.steps.length ?? 0;

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
          <FloatingBook size={done ? 112 : 128} />

          <View style={styles.messages}>
            <Text variant="heading" center style={styles.stepNow} accessibilityLiveRegion="polite">
              {done
                ? 'Masalınız hazır! ✨'
                : (job?.progress.labelTr ?? 'Kitabınız sıraya alındı…')}
            </Text>
            {!done && (
              <Text variant="caption" center style={styles.subtle}>
                Bu birkaç dakika sürebilir. Uygulamayı kapatabilirsiniz — hazır olunca
                bildirim göndeririz; hiçbir şey kaybolmaz.
              </Text>
            )}
          </View>

          {!done && totalSteps > 0 && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { flex: Math.max(doneSteps, 0.05) }]} />
                <View style={{ flex: Math.max(totalSteps - doneSteps, 0.05) }} />
              </View>
              <Text variant="caption" center style={styles.subtle}>
                {`${String(doneSteps)} / ${String(totalSteps)} adım tamamlandı — sayfalar hazır oldukça kitaba eklenir`}
              </Text>
            </View>
          )}

          {job?.partial !== undefined && job.partial.failedPageNos.length > 0 && (
            <Text variant="caption" center style={styles.subtle}>
              {`${String(job.partial.failedPageNos.length)} sayfanın resmi yeniden deneniyor; hikayeniz beklemeden açılabilir.`}
            </Text>
          )}
        </View>
      )}

      {done ? (
        <Button
          label="Hikayeyi aç"
          onPress={() => {
            router.replace(`/(app)/hikaye/${storyId ?? ''}`);
          }}
        />
      ) : !failed && !bridgeDismissed ? (
        <View style={styles.bridgeCard}>
          <Text variant="heading" style={styles.bridgeTitle}>
            Bu arada: masalı sizin sesiniz okusun 💛
          </Text>
          <Text variant="caption" style={styles.bridgeText}>
            Kitap üretilirken 3-4 dakikada sesinizi tanıtabilirsiniz. Çocuğunuz masalı
            annesinin ya da babasının sesinden dinler. Tamamen isteğe bağlı — sistem sesleri
            her zaman hazır.
          </Text>
          <Button
            label="Sesimi tanıt"
            onPress={() => {
              router.push('/(app)/ses');
            }}
          />
          <SecondaryButton
            label="Daha sonra"
            onPress={() => {
              setBridgeDismissed(true);
            }}
          />
        </View>
      ) : null}
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: '#FFFFFF' },
  center: { alignItems: 'center', gap: 28, paddingTop: 32 },
  messages: { gap: 8, paddingHorizontal: 8 },
  stepNow: { color: '#FFFFFF', fontSize: 22, lineHeight: 30, minHeight: 60 },
  subtle: { color: 'rgba(176,156,224,0.8)' },

  progressWrap: { width: '100%', maxWidth: 280, gap: 8 },
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

  bridgeCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    marginTop: 8,
  },
  bridgeTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 25 },
  bridgeText: { color: 'rgba(232,224,212,0.85)', fontSize: 14, lineHeight: 20 },
});
