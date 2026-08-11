import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dative, possessive, validateGivenName } from '@kendihikayem/shared';

import {
  Body,
  Caption,
  Card,
  Heading,
  PrimaryButton,
  Screen,
  ScreenStub,
  Title,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';

const AGE_BANDS = ['3-5', '6-8', '9-12'] as const;
const THEMES = ['Cesaret', 'Arkadaşlık', 'Merak', 'Paylaşmak', 'Uyku vakti', 'Doğa'] as const;

/** W01–W07 — the wizard. Full flow (character builder, art style, cost preview) is F1's. */
export default function Sihirbaz(): ReactNode {
  const router = useRouter();
  const [ageBand, setAgeBand] = useState<(typeof AGE_BANDS)[number]>('3-5');
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('Cesaret');

  // Placeholder hero until the wizard collects a real one.
  const hero = validateGivenName('Elif').normalized;

  return (
    <Screen>
      <Title>Yeni Hikaye</Title>
      <Body>{`${dative(hero)} özel bir masal kuralım.`}</Body>

      <Card>
        <Heading>Yaş bandı</Heading>
        <View style={styles.row}>
          {AGE_BANDS.map((band) => (
            <Chip
              key={band}
              label={`${band} yaş`}
              selected={band === ageBand}
              onPress={() => {
                setAgeBand(band);
              }}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Heading>Tema</Heading>
        <View style={styles.row}>
          {THEMES.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={item === theme}
              onPress={() => {
                setTheme(item);
              }}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Heading>Özet</Heading>
        <Body>{`${possessive(hero)} masalı · ${ageBand} yaş · ${theme}`}</Body>
        <Caption>Çocuğunuzun fotoğrafını istemiyoruz.</Caption>
      </Card>

      <PrimaryButton
        label="Ses ayarlarına geç"
        onPress={() => {
          router.push('/(app)/ses');
        }}
      />

      <ScreenStub
        screenCodes="S03–S11 · W01–W07"
        note="Karakter Kurucu, sanat stili seçimi, iskelet onayı (KAPI 1), üretim ekranı ve kredi maliyeti özeti F1 tarafından yazılacak. Burada yalnızca gezinme iskeleti var."
      />
    </Screen>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.label, color: colors.ink },
  chipTextSelected: { color: colors.primaryInk },
});
