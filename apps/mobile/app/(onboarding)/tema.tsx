import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Caption, PrimaryButton, Screen, Title } from '../../components/ui';
import { StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';
import { ThemeGrid } from '../../features/onboarding/steps';

/**
 * S03 — Tema kartları (SPEC §11.2, 0:35). Server-driven catalog; the sample
 * first line on each card shows the parent exactly what they will get.
 */
export default function Tema(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  return (
    <Screen>
      <StepBar step={2} total={5} labelTr="Adım 2 / 5 — Tema" />
      <Title>Nasıl bir masal olsun?</Title>

      <ThemeGrid
        ageBand={draft.ageBand}
        selectedCode={draft.themeCode}
        onSelect={(code, isReligious) => {
          patch({ themeCode: code, religiousOptIn: isReligious });
        }}
      />

      <PrimaryButton
        label="Devam et"
        disabled={draft.themeCode === undefined}
        onPress={() => {
          router.push('/(onboarding)/kahraman');
        }}
      />
      <Caption>Temayı sonra değiştirebilirsiniz; taslağı görmeden hiçbir ücret alınmaz.</Caption>
    </Screen>
  );
}
