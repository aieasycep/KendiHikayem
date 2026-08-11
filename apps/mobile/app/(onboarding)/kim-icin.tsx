import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { AgeBand } from '@kendihikayem/contract';
import { possessive, validateGivenName } from '@kendihikayem/shared';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { Chip, ChipRow, StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';

const AGE_BANDS: { band: AgeBand; hintTr: string }[] = [
  { band: '3-5', hintTr: 'Kısa cümleler, bol tekrar' },
  { band: '6-8', hintTr: 'Macera ve mizah dengesi' },
  { band: '9-12', hintTr: 'Katmanlı olaylar, bölümlü' },
];

/**
 * S02 — Kim için? Name + age band (SPEC §11.2, 0:15).
 * The live Turkish-suffix preview ("Elif'in masalı") is the first trust moment:
 * no competitor inflects Turkish names correctly.
 */
export default function KimIcin(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const [name, setName] = useState(draft.childName);

  const validation = validateGivenName(name);
  const canContinue = validation.ok;

  return (
    <Screen>
      <StepBar step={1} total={5} labelTr="Adım 1 / 5 — Kim için?" />
      <Title>Masal kimin için?</Title>

      <Card>
        <Heading>Çocuğunuzun adı</Heading>
        <TextInput
          accessibilityLabel="Çocuğun adı"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          maxLength={30}
          onChangeText={setName}
          placeholder="Örn. Elif"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          value={name}
        />
        {validation.ok ? (
          <View style={styles.previewBox}>
            <Caption>Kapakta böyle görünecek</Caption>
            <Body>{`${possessive(validation.normalized)} Masalı`}</Body>
          </View>
        ) : name.length > 0 ? (
          <Caption>{validation.messageTr ?? 'Bu isim kullanılamıyor.'}</Caption>
        ) : null}
      </Card>

      <Card>
        <Heading>Yaş bandı</Heading>
        <ChipRow>
          {AGE_BANDS.map(({ band }) => (
            <Chip
              key={band}
              label={`${band} yaş`}
              selected={draft.ageBand === band}
              onPress={() => {
                patch({ ageBand: band });
              }}
            />
          ))}
        </ChipRow>
        <Caption>{AGE_BANDS.find(({ band }) => band === draft.ageBand)?.hintTr ?? ''}</Caption>
      </Card>

      <PrimaryButton
        label="Devam et"
        disabled={!canContinue}
        onPress={() => {
          if (!validation.ok) return;
          patch({
            childName: validation.normalized,
            heroName: draft.heroIsChild ? validation.normalized : draft.heroName,
          });
          router.push('/(onboarding)/tema');
        }}
      />
      <Caption>Yalnızca adı ve yaş bandını soruyoruz — doğum tarihi ve fotoğraf istemiyoruz.</Caption>
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
  previewBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
});
