import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { possessive, validateGivenName } from '@kendihikayem/shared';
import { Input, Text, palette, useTheme } from '@kendihikayem/ui';

import { Caption, Card, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import { Chip, ChipRow, StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import {
  CharacterBuilderFields,
  useCharacterRequiredState,
} from '../../../features/onboarding/steps';

/**
 * W03 — Kahraman. ⭐ The star feature: "mevcut karakteri tekrar kullan".
 * If the child already has an approved character sheet, reusing it means the
 * same face in every book ("Elif'in kahramanı"), zero re-generation cost and
 * a skipped builder. Building a new character stays one tap away.
 */
export default function WizardKahraman(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { draft, patch, setBuilderField } = useWizardDraft();
  const children = useChildren();
  const [customHero, setCustomHero] = useState(draft.heroIsChild ? '' : draft.heroName);

  const child = children.data?.find((item) => (item.id as string) === draft.childId);
  const reusableCharacterId = child?.defaultCharacterId as string | undefined;
  const reusing = draft.reuseCharacterId !== undefined;

  const heroValidation = draft.heroIsChild ? undefined : validateGivenName(customHero);
  const missingRequired = useCharacterRequiredState(draft.ageBand, draft.characterBuilder);
  const canContinue =
    (reusing || !missingRequired) &&
    (draft.heroIsChild || (heroValidation !== undefined && heroValidation.ok));

  return (
    <Screen>
      <StepBar step={3} total={7} labelTr="Yeni Masal · Kahraman" />
      <Title>Kahraman kim olacak?</Title>

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
          <Input
            label="Kahramanın adı"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            onChangeText={(value) => {
              setCustomHero(value);
              const validation = validateGivenName(value);
              if (validation.ok) patch({ heroName: validation.normalized });
            }}
            placeholder="Örn. Luna"
            value={customHero}
            errorTr={
              customHero.length > 0 && heroValidation !== undefined && !heroValidation.ok
                ? (heroValidation.messageTr ?? 'Bu isim kullanılamıyor.')
                : undefined
            }
          />
        )}
      </Card>

      {reusableCharacterId !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: reusing }}
          onPress={() => {
            patch({
              reuseCharacterId: reusing ? undefined : reusableCharacterId,
            });
          }}
          style={[
            styles.reuseCard,
            {
              gap: spacing.sm,
              borderRadius: radius.md,
              padding: spacing.md,
              backgroundColor: reusing ? colors.surfaceRaised : styles.reuseWarm.backgroundColor,
              borderColor: reusing ? colors.primary : palette.peach,
            },
          ]}
        >
          <Text style={styles.reuseStar} accessibilityElementsHidden>
            ⭐
          </Text>
          <View style={styles.reuseBody}>
            <Text variant="heading" style={styles.reuseTitle}>
              {`${possessive(child?.givenName ?? 'Çocuğunuz')} kahramanını tekrar kullan`}
            </Text>
            <Text variant="caption" style={styles.reuseText}>
              Önceki kitapta onayladığınız çizim aynen kullanılır — kahraman her kitapta aynı
              yüzle çıkar, yeniden çizim beklemezsiniz.
            </Text>
            <Text
              variant="label"
              style={{ color: reusing ? colors.primary : colors.inkMuted }}
            >
              {reusing ? '✓ Seçildi — karakter kurucu atlanacak' : 'Dokunarak seçin'}
            </Text>
          </View>
        </Pressable>
      )}

      {!reusing && (
        <CharacterBuilderFields
          ageBand={draft.ageBand}
          values={draft.characterBuilder}
          onSelect={setBuilderField}
        />
      )}

      <PrimaryButton
        label="Devam et"
        disabled={!canContinue}
        onPress={() => {
          router.push('/(app)/sihirbaz/stil');
        }}
      />
      {!reusing && missingRequired && (
        <Caption>Yıldızlı alanları seçmeden devam edilemez.</Caption>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  reuseCard: { flexDirection: 'row', borderWidth: 2 },
  /** Sıcak şeftali zemin — tek seferlik değer; tema rolü değil, vurgu. */
  reuseWarm: { backgroundColor: 'rgba(245, 196, 168, 0.22)' },
  reuseStar: { fontSize: 26 },
  reuseBody: { flex: 1, gap: 4 },
  reuseTitle: { fontSize: 18, lineHeight: 24 },
  reuseText: { fontSize: 13, lineHeight: 19 },
});
