import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { accusative } from '@kendihikayem/shared';

import { Body, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useSystemVoices, useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
import { AsyncGate, StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { VoiceRow } from '../../../features/wizard/VoiceRow';

/**
 * W06 — Ses seçimi (Figma `StoryCreation` 5. adım "Masalı kim anlatsın?").
 * Tasarımdaki gibi TEK liste: önce kişisel (klonlanmış) sesler, sonra hazır
 * anlatıcılar — ara başlık yok. Seslendirme hikaye onayından SONRA çalışır
 * (⏸ KAPI 2); seçim taslakta saklanır.
 */
export default function WizardSes(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const profiles = useVoiceProfiles();
  const systemVoices = useSystemVoices();

  const childAcc = draft.childName === '' ? 'çocuğunu' : accusative(draft.childName);
  const readyProfiles = profiles.data?.items.filter((item) => item.status === 'ready') ?? [];

  return (
    <Screen>
      <StepBar step={6} total={7} labelTr="Yeni Hikâye · Ses" />
      <Title>Masalı kim anlatsın?</Title>
      <Body>{`Seçtiğin ses her masalda ${childAcc} bekliyor olacak.`}</Body>

      <AsyncGate
        isLoading={systemVoices.isLoading}
        error={systemVoices.error}
        data={systemVoices.data}
        emptyTr="Sistem sesleri şu an listelenemiyor. Biraz sonra tekrar deneyin."
        onRetry={() => void systemVoices.refetch()}
      >
        {(voices) => (
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

      <PrimaryButton
        label="Devam"
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
});
