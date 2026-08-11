import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VoiceProfile } from '@kendihikayem/contract';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
import { AsyncGate, SecondaryButton, TrustStrip } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';

const STATUS_TR: Record<VoiceProfile['status'], string> = {
  draft: 'Taslak — kayıt bekliyor',
  recording: 'Kayıt sürüyor',
  processing: 'İşleniyor',
  preview_ready: 'Önizleme hazır — onayınızı bekliyor',
  ready: 'Kullanıma hazır',
  failed: 'Başarısız oldu',
  revoked: 'Silindi',
};

const BADGE_TR = { mukemmel: 'Mükemmel', iyi: 'İyi', kabul_edilebilir: 'Kabul edilebilir' } as const;

/**
 * Voice hub. Lists existing profiles (contract data) and starts the V01–V09
 * onboarding. Voice is OPTIONAL everywhere — the product is complete with
 * system voices, and this screen says so explicitly.
 */
export default function SesHub(): ReactNode {
  const router = useRouter();
  const profiles = useVoiceProfiles();
  const flow = useVoiceFlow();

  const limitReached =
    profiles.data !== undefined && profiles.data.items.length >= profiles.data.limit;

  return (
    <Screen>
      <Title>Sesler</Title>
      <Body>
        Masalları hazır anlatıcılarla dinletebilirsiniz; isterseniz 3-4 dakikada kendi sesinizi
        tanıtırsınız ve çocuğunuz her masalı sizin sesinizden dinler.
      </Body>

      <AsyncGate
        isLoading={profiles.isLoading}
        error={profiles.error}
        data={profiles.data}
        onRetry={() => void profiles.refetch()}
        loadingTr="Ses profilleriniz yükleniyor…"
      >
        {(data) => (
          <>
            {data.items.length === 0 && (
              <Card>
                <Heading>Henüz kayıtlı sesiniz yok</Heading>
                <Caption>
                  Sistem sesleri her zaman hazır. Kendi sesinizi eklemek tamamen isteğe bağlı.
                </Caption>
              </Card>
            )}
            {data.items.map((profile) => (
              <Card key={profile.id as string}>
                <View style={styles.profileRow}>
                  <View style={styles.profileBody}>
                    <Heading>{profile.displayName}</Heading>
                    <Caption>{STATUS_TR[profile.status]}</Caption>
                    {profile.qualityBadge !== undefined && (
                      <Caption>{`Kalite: ${BADGE_TR[profile.qualityBadge]}`}</Caption>
                    )}
                    {profile.storiesUsingCount > 0 && (
                      <Caption>{`${String(profile.storiesUsingCount)} hikayede kullanılıyor`}</Caption>
                    )}
                  </View>
                  <Text style={styles.profileEmoji}>
                    {profile.relation === 'anne' ? '👩' : profile.relation === 'baba' ? '👨' : '🎙️'}
                  </Text>
                </View>
                {profile.status === 'preview_ready' && (
                  <SecondaryButton
                    label="Önizlemeyi dinle ve onayla"
                    onPress={() => {
                      flow.setProfile(profile.id as string, profile.displayName, profile.relation);
                      router.push('/(app)/ses/onizleme');
                    }}
                  />
                )}
              </Card>
            ))}
          </>
        )}
      </AsyncGate>

      <PrimaryButton
        label="Kendi sesimi ekle"
        disabled={limitReached}
        onPress={() => {
          router.push('/(app)/ses/deger');
        }}
      />
      {limitReached && (
        <Caption>
          Ses profili hakkınız dolu. Yeni ses eklemek için Ayarlar → Sesim ekranından mevcut bir
          sesi silebilirsiniz.
        </Caption>
      )}

      <TrustStrip
        items={[
          'Sesiniz AB’deki sunucumuzda şifreli saklanır.',
          'Tek dokunuşla silersiniz; sağlayıcıdan da silinir.',
          'Asla başka bir hesapta kullanılmaz.',
          'Çocuk sesi asla kaydedilmez.',
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  profileBody: { flex: 1, gap: 2 },
  profileEmoji: {
    ...typography.title,
    fontSize: 30,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
    overflow: 'hidden',
  },
});
