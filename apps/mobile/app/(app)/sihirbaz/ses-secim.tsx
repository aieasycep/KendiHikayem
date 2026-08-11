import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, spacing, typography } from '../../../constants/theme';
import { useSystemVoices, useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
import {
  AsyncGate,
  SecondaryButton,
  SelectCard,
  StepBar,
} from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';

/**
 * W06 — Ses seçimi. Cloned profiles (if any, status ready) + system voices.
 * Narration itself runs only AFTER story approval (⏸ KAPI 2); the choice is
 * stored in the draft and used when the parent hits "Dinle".
 */
export default function WizardSes(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const profiles = useVoiceProfiles();
  const systemVoices = useSystemVoices();

  const readyProfiles = profiles.data?.items.filter((item) => item.status === 'ready') ?? [];

  return (
    <Screen>
      <StepBar step={6} total={7} labelTr="Adım 6 / 7 — Ses" />
      <Title>Masalı kim seslendirsin?</Title>
      <Body>Seslendirme, hikayeyi onayladıktan sonra hazırlanır; seçiminizi hatırlarız.</Body>

      {readyProfiles.length > 0 && (
        <>
          <Heading>Sizin sesleriniz</Heading>
          <View style={styles.grid}>
            {readyProfiles.map((profile) => (
              <SelectCard
                key={profile.id as string}
                icon={profile.relation === 'anne' ? '👩' : profile.relation === 'baba' ? '👨' : '🎙️'}
                titleTr={profile.displayName}
                subtitleTr="Klonlanmış ses — sizin sesiniz"
                selected={
                  draft.voiceChoice?.kind === 'cloned' &&
                  draft.voiceChoice.voiceProfileId === (profile.id as string)
                }
                onPress={() => {
                  patch({
                    voiceChoice: {
                      kind: 'cloned',
                      voiceProfileId: profile.id as string,
                      labelTr: profile.displayName,
                    },
                  });
                }}
              />
            ))}
          </View>
        </>
      )}

      <Heading>Hazır anlatıcılar</Heading>
      <AsyncGate
        isLoading={systemVoices.isLoading}
        error={systemVoices.error}
        data={systemVoices.data}
        emptyTr="Sistem sesleri şu an listelenemiyor. Biraz sonra tekrar deneyin."
        onRetry={() => void systemVoices.refetch()}
      >
        {(voices) => (
          <View style={styles.grid}>
            {voices.map((voice) => (
              <SelectCard
                key={voice.code}
                icon={voice.gender === 'kadin' ? '🎙️' : '🎤'}
                titleTr={voice.displayName}
                subtitleTr={voice.descriptionTr}
                selected={
                  draft.voiceChoice?.kind === 'system' &&
                  draft.voiceChoice.systemVoiceCode === voice.code
                }
                onPress={() => {
                  patch({
                    voiceChoice: {
                      kind: 'system',
                      systemVoiceCode: voice.code,
                      labelTr: voice.displayName,
                    },
                  });
                }}
              />
            ))}
          </View>
        )}
      </AsyncGate>

      {readyProfiles.length === 0 && (
        <Card>
          <View style={styles.upsellRow}>
            <Text style={styles.upsellEmoji}>💛</Text>
            <View style={styles.upsellBody}>
              <Text style={styles.upsellTitle}>Kendi sesinizi de ekleyebilirsiniz</Text>
              <Caption>3-4 dakika sürer; masalları çocuğunuza siz okumuş olursunuz.</Caption>
            </View>
          </View>
          <SecondaryButton
            label="Sesimi tanıt"
            onPress={() => {
              router.push('/(app)/ses');
            }}
          />
        </Card>
      )}

      <PrimaryButton
        label="Devam et"
        disabled={draft.voiceChoice === undefined}
        onPress={() => {
          router.push('/(app)/sihirbaz/ozet');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  upsellRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  upsellEmoji: { fontSize: 26 },
  upsellBody: { flex: 1, gap: 2 },
  upsellTitle: { ...typography.label, fontSize: 16, color: colors.ink },
});
