import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@kendihikayem/ui';

import { Body, Card, Caption, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useSystemVoices, useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
import { AsyncGate, SecondaryButton, StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { VoiceRow } from '../../../features/wizard/VoiceRow';

/**
 * W06 — Ses seçimi (Figma "Masalı kim anlatsın?"). Cloned profiles (if any,
 * status ready) + system voices as full-width voice cards with inline sample
 * preview. Narration itself runs only AFTER story approval (⏸ KAPI 2); the
 * choice is stored in the draft and used when the parent hits "Dinle".
 */
export default function WizardSes(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const profiles = useVoiceProfiles();
  const systemVoices = useSystemVoices();

  const readyProfiles = profiles.data?.items.filter((item) => item.status === 'ready') ?? [];

  return (
    <Screen>
      <StepBar step={6} total={7} labelTr="Yeni Masal · Ses" />
      <Title>Masalı kim anlatsın?</Title>
      <Body>Seslendirme, hikayeyi onayladıktan sonra hazırlanır; seçiminizi hatırlarız.</Body>

      {readyProfiles.length > 0 && (
        <>
          <Heading>Sizin sesleriniz</Heading>
          <View style={styles.list}>
            {readyProfiles.map((profile) => (
              <VoiceRow
                key={profile.id as string}
                titleTr={profile.displayName}
                subtitleTr="Klonlanmış ses — sizin sesiniz"
                personal
                emoji={profile.relation === 'anne' ? '👩' : profile.relation === 'baba' ? '👨' : '🎙️'}
                selected={
                  draft.voiceChoice?.kind === 'cloned' &&
                  draft.voiceChoice.voiceProfileId === (profile.id as string)
                }
                sampleUrl={profile.preview?.url}
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
          <View style={styles.list}>
            {voices.map((voice) => (
              <VoiceRow
                key={voice.code}
                titleTr={voice.displayName}
                subtitleTr={voice.descriptionTr}
                personal={false}
                emoji={voice.gender === 'kadin' ? '🌙' : '🌊'}
                selected={
                  draft.voiceChoice?.kind === 'system' &&
                  draft.voiceChoice.systemVoiceCode === voice.code
                }
                sampleUrl={voice.sample.url}
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
            <Text style={styles.upsellEmoji} accessibilityElementsHidden>
              💛
            </Text>
            <View style={styles.upsellBody}>
              <Text variant="bodyStrong">Kendi sesinizi de ekleyebilirsiniz</Text>
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
  list: { gap: 10 },
  upsellRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  upsellEmoji: { fontSize: 26 },
  upsellBody: { flex: 1, gap: 2 },
});
