import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { StyleGrid } from '../../../features/onboarding/steps';

/** W04 — Sanat stili. Same catalog grid as S05 (shared component). */
export default function WizardStil(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  return (
    <Screen>
      <StepBar step={4} total={7} labelTr="Yeni Masal · Çizim stili" />
      <Title>Hangi çizim stili?</Title>

      <StyleGrid
        selectedCode={draft.artStyleCode}
        onSelect={(code) => {
          patch({ artStyleCode: code });
        }}
      />

      <PrimaryButton
        label="Devam et"
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
