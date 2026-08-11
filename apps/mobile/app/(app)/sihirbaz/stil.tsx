import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { StyleGrid } from '../../../features/onboarding/steps';

/**
 * W04 — Sanat stili. Tasarımın 5 adımlı akışında karşılığı yoktur (sözleşme
 * `artStyleCode` ister); görsel dil paylaşılan ızgaradan gelir.
 */
export default function WizardStil(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  return (
    <Screen>
      <StepBar step={4} total={7} labelTr="Yeni Hikâye · Çizim stili" />
      <Title>Hangi çizim stili?</Title>

      <StyleGrid
        selectedCode={draft.artStyleCode}
        onSelect={(code) => {
          patch({ artStyleCode: code });
        }}
      />

      <PrimaryButton
        label="Devam"
        disabled={draft.artStyleCode === undefined}
        onPress={() => {
          router.push('/(app)/sihirbaz/ayar');
        }}
      />
      <Caption>
        Kahramanı tekrar kullanıyorsanız aynı stili seçmek tutarlılığı en yükseğe taşır.
      </Caption>
    </Screen>
  );
}
