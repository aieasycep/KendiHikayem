import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Caption, PrimaryButton, Screen, Title } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { ErrorBanner, SecondaryButton } from '../../features/onboarding/components';
import { useJob } from '../../lib/useJob';

/**
 * S10 — Üretim + atlanabilir ses köprüsü (SPEC §11.2, 3:00).
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
    <Screen>
      <Title>{done ? 'Masalınız hazır! 🎉' : 'Kitabınız üretiliyor'}</Title>
      {!done && !failed && (
        <Body>
          Bu birkaç dakika sürebilir. Uygulamayı kapatabilirsiniz — hazır olunca bildirim
          göndeririz; hiçbir şey kaybolmaz.
        </Body>
      )}

      {failed ? (
        <>
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
        <ErrorBanner error={error} />
      ) : (
        <View style={styles.progressCard}>
          <Text style={styles.stepNow}>
            {done ? 'Bütün sayfalar tamamlandı' : (job?.progress.labelTr ?? 'Sıraya alındı…')}
          </Text>
          {totalSteps > 0 && (
            <>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { flex: Math.max(doneSteps, 0.02) }]} />
                <View style={{ flex: Math.max(totalSteps - doneSteps, 0.02) }} />
              </View>
              <Caption>{`${String(doneSteps)} / ${String(totalSteps)} adım tamamlandı — sayfalar hazır oldukça kitaba eklenir`}</Caption>
            </>
          )}
          {job?.partial !== undefined && job.partial.failedPageNos.length > 0 && (
            <Caption>
              {`${String(job.partial.failedPageNos.length)} sayfanın resmi yeniden deneniyor; hikayeniz beklemeden açılabilir.`}
            </Caption>
          )}
        </View>
      )}

      {done ? (
        <PrimaryButton
          label="Hikayeyi aç"
          onPress={() => {
            router.replace(`/(app)/hikaye/${storyId ?? ''}`);
          }}
        />
      ) : !failed && !bridgeDismissed ? (
        <View style={styles.bridgeCard}>
          <Text style={styles.bridgeTitle}>Bu arada: masalı sizin sesiniz okusun 💛</Text>
          <Text style={styles.bridgeText}>
            Kitap üretilirken 3-4 dakikada sesinizi tanıtabilirsiniz. Çocuğunuz masalı annesinin
            ya da babasının sesinden dinler. Tamamen isteğe bağlı — sistem sesleri her zaman
            hazır.
          </Text>
          <PrimaryButton
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
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },

  bridgeCard: {
    backgroundColor: '#FFF7E8',
    borderColor: '#F2C879',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bridgeTitle: { ...typography.heading, fontSize: 19, color: colors.ink },
  bridgeText: { ...typography.caption, fontSize: 14, lineHeight: 20, color: colors.ink },
});
