import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AgeBand } from '@kendihikayem/contract';
import { possessive, validateGivenName } from '@kendihikayem/shared';
import { Input, Text, useTheme } from '@kendihikayem/ui';

import { Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../components/ui';
import { Chip, ChipRow, StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';

const AGE_BANDS: { band: AgeBand; hintTr: string }[] = [
  { band: '0-2', hintTr: 'Tek cümlelik sayfalar, bol tekrar, ninni ritmi' },
  { band: '3-5', hintTr: 'Kısa cümleler, bol tekrar' },
  { band: '6-8', hintTr: 'Macera ve mizah dengesi' },
];

/**
 * S02 — Kim için? Name + age band (SPEC §11.2, 0:15).
 * The live Turkish-suffix preview ("Elif'in masalı") is the first trust moment:
 * no competitor inflects Turkish names correctly.
 */
export default function KimIcin(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { draft, patch } = useWizardDraft();
  const [name, setName] = useState(draft.childName);

  const validation = validateGivenName(name);
  const canContinue = validation.ok;

  return (
    <Screen>
      <StepBar step={1} total={5} labelTr="Yeni Masal · Kim için?" />
      <Title>Masal kimin için?</Title>

      <Card>
        <Input
          label="Çocuğunuzun adı"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          maxLength={30}
          onChangeText={setName}
          placeholder="Örn. Elif"
          value={name}
          errorTr={
            !validation.ok && name.length > 0
              ? (validation.messageTr ?? 'Bu isim kullanılamıyor.')
              : undefined
          }
        />
        {validation.ok && (
          <View
            style={[
              styles.previewBox,
              {
                backgroundColor: colors.surfaceRaised,
                borderRadius: radius.sm,
                padding: spacing.sm,
              },
            ]}
          >
            <Caption>Kapakta böyle görünecek</Caption>
            <Text variant="heading" style={{ color: colors.primary }}>
              {`${possessive(validation.normalized)} Masalı`}
            </Text>
          </View>
        )}
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
  previewBox: { gap: 2 },
});
