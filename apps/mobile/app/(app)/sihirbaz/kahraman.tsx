import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { possessive, validateGivenName } from '@kendihikayem/shared';
import { Input, Text, palette, useTheme } from '@kendihikayem/ui';

import { Body, Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import { SelectedCheck, StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import {
  CharacterBuilderFields,
  useCharacterRequiredState,
} from '../../../features/onboarding/steps';

/**
 * W02 — Kahraman (Figma `StoryCreation` 2. adım "Hikâyemizin kahramanı kim?").
 * Tasarımdaki iki seçim satırı: "{çocuk} kahraman olsun" / "Başka bir kahraman
 * oluştur"; özel kahramanda ad alanı. ⭐ "Mevcut karakteri tekrar kullan" kartı
 * ürünün yıldız özelliğidir (tasarım kapsam dışı) ve korunur.
 */
export default function WizardKahraman(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { draft, patch, setBuilderField } = useWizardDraft();
  const children = useChildren();
  const [customHero, setCustomHero] = useState(draft.heroIsChild ? '' : draft.heroName);

  const childName = draft.childName === '' ? 'Çocuğunuz' : draft.childName;
  const child = children.data?.find((item) => (item.id as string) === draft.childId);
  const reusableCharacterId = child?.defaultCharacterId as string | undefined;
  const reusing = draft.reuseCharacterId !== undefined;

  const heroValidation = draft.heroIsChild ? undefined : validateGivenName(customHero);
  const missingRequired = useCharacterRequiredState(draft.ageBand, draft.characterBuilder);
  const canContinue =
    (reusing || !missingRequired) &&
    (draft.heroIsChild || (heroValidation !== undefined && heroValidation.ok));

  const options = [
    {
      id: 'child' as const,
      emoji: '🧒',
      labelTr: `${childName} kahraman olsun`,
      subTr: `Kahraman: ${childName}`,
      selected: draft.heroIsChild,
      onPress: () => {
        patch({ heroIsChild: true, heroName: draft.childName });
      },
    },
    {
      id: 'custom' as const,
      emoji: '✨',
      labelTr: 'Başka bir kahraman oluştur',
      subTr: 'Sen belirle',
      selected: !draft.heroIsChild,
      onPress: () => {
        patch({ heroIsChild: false, heroName: customHero });
      },
    },
  ];

  return (
    <Screen>
      <StepBar step={2} total={7} labelTr="Yeni Hikâye · Kahraman" />
      <Title>Hikâyemizin kahramanı kim?</Title>
      <Body>{`İstersen ${childName} kahramanı olsun ya da yeni biri oluştur.`}</Body>

      <View style={{ gap: spacing.sm }}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: option.selected }}
            onPress={option.onPress}
            style={({ pressed }) => [
              styles.optionRow,
              {
                backgroundColor: option.selected
                  ? colors.surfaceRaised
                  : pressed
                    ? colors.surfaceMuted
                    : colors.surface,
                borderColor: option.selected ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={styles.optionEmoji} accessibilityElementsHidden>
              {option.emoji}
            </Text>
            <View style={styles.optionBody}>
              <Text variant="bodyStrong" style={styles.optionLabel}>
                {option.labelTr}
              </Text>
              <Text variant="caption" tone="muted" style={styles.optionSub}>
                {option.subTr}
              </Text>
            </View>
            {option.selected && <SelectedCheck size={24} />}
          </Pressable>
        ))}
      </View>

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
        label="Devam"
        disabled={!canContinue}
        onPress={() => {
          router.push('/(app)/sihirbaz/tema');
        }}
      />
      {!reusing && missingRequired && (
        <Caption>Yıldızlı alanları seçmeden devam edilemez.</Caption>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Figma seçim satırı: 16/18 dolgu · 18 yarıçap · 2 px kenarlık · emoji 28. */
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 2,
  },
  optionEmoji: { fontSize: 28, lineHeight: 34 },
  optionBody: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 15, lineHeight: 20 },
  optionSub: { fontSize: 13, lineHeight: 18 },

  reuseCard: { flexDirection: 'row', borderWidth: 2 },
  /** Sıcak şeftali zemin — tek seferlik değer; tema rolü değil, vurgu. */
  reuseWarm: { backgroundColor: 'rgba(245, 196, 168, 0.22)' },
  reuseStar: { fontSize: 26 },
  reuseBody: { flex: 1, gap: 4 },
  reuseTitle: { fontSize: 18, lineHeight: 24 },
  reuseText: { fontSize: 13, lineHeight: 19 },
});
