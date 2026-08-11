import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

// Alt yol importu BİLEREK: mock'un kök girişi msw/handler'ları çeker; fixture
// modülü tek başına saf veridir ve canlı (live) pakete msw sokmaz.
import { suggestionForInterests } from '@kendihikayem/mock/fixtures/suggestions';
import { Input, Text, useTheme } from '@kendihikayem/ui';

import { Body, Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import { StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { ThemeGrid } from '../../../features/onboarding/steps';

/**
 * W03 — Tema (Figma `StoryCreation` 3. adım "Nasıl bir hikâye?").
 * Tasarımdaki AI öneri kutusu ("Ege için öneri … astronot yapalım mı?") ve
 * "Aklında özel bir hikâye mi var?" alanı bu adımdadır. Öneri içeriği ekrana
 * gömülü değildir; sözleşmede öneri ucu olmadığı için `packages/mock`
 * fixture'ından, çocuğun gerçek ilgi alanlarıyla eşleşerek gelir.
 *
 * NOT (tasarım/sözleşme çelişkisi): tasarım temayı çoklu seçtirir; sözleşme
 * `themeCode` tek değerdir. Tek seçim korunur — rapora not düşüldü.
 */
export default function WizardTema(): ReactNode {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { draft, patch } = useWizardDraft();
  const children = useChildren();

  const childName = draft.childName === '' ? 'Çocuğunuz' : draft.childName;
  const child = children.data?.find((item) => (item.id as string) === draft.childId);
  const suggestion = suggestionForInterests(child?.interests ?? []);
  const freeIdea = draft.freeIdeaTr ?? '';

  return (
    <Screen>
      <StepBar step={3} total={7} labelTr="Yeni Hikâye · Tema" />
      <Title>Nasıl bir hikâye?</Title>
      <Body>Masalın temasını seç.</Body>

      {/* ── Figma AI öneri kutusu ─────────────────────────────── */}
      <View
        style={[
          styles.suggestBox,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: 'rgba(124, 92, 191, 0.2)',
            borderRadius: 14,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}
      >
        <Text style={styles.suggestSpark} accessibilityElementsHidden>
          ✨
        </Text>
        <View style={styles.suggestBody}>
          <Text variant="label" style={[styles.suggestKicker, { color: colors.primary }]}>
            {`${childName} için öneri`}
          </Text>
          <Text variant="caption" style={styles.suggestText}>
            {suggestion.bodyTr.replaceAll('{cocuk}', childName)}
          </Text>
          <View style={[styles.suggestChips, { gap: 6 }]}>
            {suggestion.chipsTr.map((chip) => {
              const active = freeIdea === chip;
              return (
                <Pressable
                  key={chip}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    patch({ freeIdeaTr: active ? undefined : chip });
                  }}
                  style={[
                    styles.suggestChip,
                    { backgroundColor: active ? colors.primary : colors.surface },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={[
                      styles.suggestChipText,
                      { color: active ? colors.inkOnPrimary : colors.primary },
                    ]}
                  >
                    {chip}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <ThemeGrid
        ageBand={draft.ageBand}
        selectedCode={draft.themeCode}
        onSelect={(code, isReligious) => {
          patch({ themeCode: code, religiousOptIn: isReligious });
        }}
      />

      {/* ── Figma: "Aklında özel bir hikâye mi var?" ──────────── */}
      <Input
        label="Aklında özel bir hikâye mi var?"
        maxLength={200}
        multiline
        onChangeText={(value) => {
          patch({ freeIdeaTr: value === '' ? undefined : value });
        }}
        placeholder={`Örneğin: ${childName} uzaya gidip kaybolan küçük bir yıldızı evine döndürsün.`}
        value={freeIdea}
      />
      <Caption>Boş bıraksan da harika bir hikâye oluştururuz.</Caption>

      <PrimaryButton
        label="Devam"
        disabled={draft.themeCode === undefined}
        onPress={() => {
          router.push('/(app)/sihirbaz/stil');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Figma: lavanta degrade zemin, 1px mor kenarlık, ✨ + metin + çipler. */
  suggestBox: { flexDirection: 'row', borderWidth: 1, alignItems: 'flex-start' },
  suggestSpark: { fontSize: 18, lineHeight: 24 },
  suggestBody: { flex: 1, gap: 6 },
  suggestKicker: { fontSize: 13, lineHeight: 17 },
  suggestText: { fontSize: 13, lineHeight: 20 },
  suggestChips: { flexDirection: 'row', flexWrap: 'wrap' },
  /* Figma çip: 8 yarıçap · 4/10 dolgu · 12/600. */
  suggestChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  suggestChipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
