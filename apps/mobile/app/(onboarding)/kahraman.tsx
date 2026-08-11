import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { validateGivenName } from '@kendihikayem/shared';

import { Caption, Card, PrimaryButton, Screen, Title } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { Chip, ChipRow, StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';
import {
  CharacterBuilderFields,
  useCharacterRequiredState,
} from '../../features/onboarding/steps';

/**
 * S04 — Kahraman + Karakter Kurucu (SPEC §11.2, 1:00).
 *
 * The character is built ONLY from catalog options — the screen carries the
 * product's loudest trust message verbatim: "Çocuğunuzun fotoğrafını istemiyoruz."
 * (rendered inside CharacterBuilderFields from `characterOptions.privacyNoteTr`).
 */
export default function Kahraman(): ReactNode {
  const router = useRouter();
  const { draft, patch, setBuilderField } = useWizardDraft();
  const [customHero, setCustomHero] = useState(draft.heroIsChild ? '' : draft.heroName);

  const heroValidation = draft.heroIsChild ? undefined : validateGivenName(customHero);
  const missingRequired = useCharacterRequiredState(draft.ageBand, draft.characterBuilder);
  const canContinue =
    !missingRequired && (draft.heroIsChild || (heroValidation !== undefined && heroValidation.ok));

  return (
    <Screen>
      <StepBar step={3} total={5} labelTr="Adım 3 / 5 — Kahraman" />
      <Title>Kahramanımız kim?</Title>

      <Card>
        <ChipRow>
          <Chip
            label={`${draft.childName === '' ? 'Çocuğum' : draft.childName} (kendisi)`}
            selected={draft.heroIsChild}
            onPress={() => {
              patch({ heroIsChild: true, heroName: draft.childName });
            }}
          />
          <Chip
            label="Hayali bir kahraman"
            selected={!draft.heroIsChild}
            onPress={() => {
              patch({ heroIsChild: false, heroName: customHero });
            }}
          />
        </ChipRow>
        {!draft.heroIsChild && (
          <>
            <TextInput
              accessibilityLabel="Kahramanın adı"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={30}
              onChangeText={(value) => {
                setCustomHero(value);
                const validation = validateGivenName(value);
                if (validation.ok) patch({ heroName: validation.normalized });
              }}
              placeholder="Kahramanın adı"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              value={customHero}
            />
            {customHero.length > 0 && heroValidation !== undefined && !heroValidation.ok && (
              <Caption>{heroValidation.messageTr ?? 'Bu isim kullanılamıyor.'}</Caption>
            )}
          </>
        )}
      </Card>

      <CharacterBuilderFields
        ageBand={draft.ageBand}
        values={draft.characterBuilder}
        onSelect={setBuilderField}
      />

      <PrimaryButton
        label="Devam et"
        disabled={!canContinue}
        onPress={() => {
          router.push('/(onboarding)/stil');
        }}
      />
      {missingRequired && <Caption>Yıldızlı alanları seçmeden devam edilemez.</Caption>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
});
