import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { possessive } from '@kendihikayem/shared';

import { Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { ThemeGrid } from '../../../features/onboarding/steps';

/** W02 — Tema. Same server-driven grid as S03 (shared component, zero drift). */
export default function WizardTema(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  return (
    <Screen>
      <StepBar step={2} total={7} labelTr="Adım 2 / 7 — Tema" />
      <Title>
        {draft.childName === '' ? 'Nasıl bir masal olsun?' : `${possessive(draft.childName)} masalı ne anlatsın?`}
      </Title>

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
          router.push('/(app)/sihirbaz/kahraman');
        }}
      />
      <Caption>İskeleti görmeden yalnızca taslak ücreti düşer; beğenmezseniz gerisi alınmaz.</Caption>
    </Screen>
  );
}
