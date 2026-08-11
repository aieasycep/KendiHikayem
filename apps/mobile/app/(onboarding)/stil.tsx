import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Caption, PrimaryButton, Screen, Title } from '../../components/ui';
import { StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';
import { StyleGrid } from '../../features/onboarding/steps';

/**
 * S05 — Sanat stili (SPEC §11.2, 1:45). Fixed catalog cards; free style text is
 * impossible by design (STYLE_DNA lives server-side, SPEC §8.1 ②).
 */
export default function Stil(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  return (
    <Screen>
      <StepBar step={4} total={5} labelTr="Adım 4 / 5 — Çizim stili" />
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
          router.push('/(onboarding)/ozet');
        }}
      />
      <Caption>Bütün kitap tek stilde çizilir; kahraman her sayfada aynı görünür.</Caption>
    </Screen>
  );
}
