import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import type { PageCount } from '@kendihikayem/contract';
import { Text, useTheme } from '@kendihikayem/ui';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { Chip, ChipRow, SelectedCheck, StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';

/**
 * W05 — Hikâye ayarları (Figma `StoryCreation` 4. adım). Tasarımdaki uzunluk
 * satırları (emoji + ad + süre + onay dairesi) sözleşmenin gerçek sayfa
 * sayılarıyla doldurulur. Değer/kültürel doku/dini içerik kartları tasarımın
 * kapsamadığı sözleşme alanlarıdır; dini içerik OPT-IN'dir ve VARSAYILAN
 * KAPALIDIR (SPEC §11.1).
 *
 * NOT (tasarım/ürün çelişkisi): tasarım bu adımda yaş grubu da seçtirir; üründe
 * yaş bandı W01'de çocuk profilinden gelir (sözleşme). Rapora not düşüldü.
 */
const DURATIONS: { pageCount: PageCount; emoji: string; labelTr: string; subTr: string }[] = [
  { pageCount: 12, emoji: '⚡', labelTr: 'Kısa', subTr: '12 sayfa · uyku öncesi için ideal' },
  { pageCount: 14, emoji: '📖', labelTr: 'Orta', subTr: '14 sayfa' },
  { pageCount: 16, emoji: '🌙', labelTr: 'Uzun', subTr: '16 sayfa · daha uzun bir macera' },
];

const LESSON_SUGGESTIONS = [
  'Cesaret',
  'Paylaşmak',
  'Dürüstlük',
  'Sabır',
  'Yardımlaşma',
  'Kendine güven',
];

const CULTURAL_TAGS: { code: string; labelTr: string }[] = [
  { code: 'turkiye', labelTr: 'Türkiye motifleri' },
  { code: 'anadolu', labelTr: 'Anadolu masal geleneği' },
  { code: 'deniz', labelTr: 'Deniz ve kıyı kasabası' },
  { code: 'koy', labelTr: 'Köy ve doğa' },
];

export default function WizardAyar(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { draft, patch } = useWizardDraft();

  const toggleTag = (code: string): void => {
    const has = draft.culturalTags.includes(code);
    patch({
      culturalTags: has
        ? draft.culturalTags.filter((tag) => tag !== code)
        : [...draft.culturalTags, code].slice(0, 4),
    });
  };

  return (
    <Screen>
      <StepBar step={5} total={7} labelTr="Yeni Hikâye · Ayarlar" />
      <Title>Hikâye ayarları</Title>
      <Body>Masalın uzunluğunu belirle.</Body>

      <Text variant="caption" tone="muted" style={styles.kicker}>
        HİKÂYE UZUNLUĞU
      </Text>
      <View style={{ gap: spacing.sm }}>
        {DURATIONS.map((duration) => {
          const selected = draft.pageCount === duration.pageCount;
          return (
            <Pressable
              key={duration.pageCount}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                patch({ pageCount: duration.pageCount });
              }}
              style={({ pressed }) => [
                styles.durationRow,
                {
                  backgroundColor: selected
                    ? colors.surfaceRaised
                    : pressed
                      ? colors.surfaceMuted
                      : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={styles.durationEmoji} accessibilityElementsHidden>
                {duration.emoji}
              </Text>
              <View style={styles.durationBody}>
                <Text
                  variant="bodyStrong"
                  style={[styles.durationLabel, selected && { color: colors.primary }]}
                >
                  {duration.labelTr}
                </Text>
                <Text variant="caption" tone="muted" style={styles.durationSub}>
                  {duration.subTr}
                </Text>
              </View>
              {selected && <SelectedCheck size={24} />}
            </Pressable>
          );
        })}
      </View>

      <Card>
        <Heading>Hikayenin kalbindeki değer</Heading>
        <ChipRow>
          {LESSON_SUGGESTIONS.map((lesson) => (
            <Chip
              key={lesson}
              label={lesson}
              selected={draft.lessonHintTr === lesson}
              onPress={() => {
                patch({ lessonHintTr: draft.lessonHintTr === lesson ? undefined : lesson });
              }}
            />
          ))}
        </ChipRow>
      </Card>

      <Card>
        <Heading>Kültürel doku</Heading>
        <ChipRow>
          {CULTURAL_TAGS.map((tag) => (
            <Chip
              key={tag.code}
              label={tag.labelTr}
              selected={draft.culturalTags.includes(tag.code)}
              onPress={() => {
                toggleTag(tag.code);
              }}
            />
          ))}
        </ChipRow>
        <View
          style={[
            styles.religiousRow,
            {
              gap: spacing.sm,
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.sm,
              padding: spacing.sm,
            },
          ]}
        >
          <View style={styles.religiousBody}>
            <Text variant="label">Dini öğeler yer alabilsin</Text>
            <Text variant="caption" tone="muted" style={styles.religiousText}>
              Varsayılan olarak kapalıdır; yalnızca siz açarsanız bayram, dua gibi öğeler
              geçebilir.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Dini içerik"
            onValueChange={(value) => {
              patch({ religiousOptIn: value });
            }}
            thumbColor={colors.surface}
            trackColor={{ false: colors.border, true: colors.primary }}
            value={draft.religiousOptIn}
          />
        </View>
      </Card>

      <PrimaryButton
        label="Devam"
        onPress={() => {
          router.push('/(app)/sihirbaz/ses-secim');
        }}
      />
      <Caption>12 sayfa uyku öncesi için ideal; 16 sayfa daha uzun bir macera.</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 13, letterSpacing: 0.8, fontWeight: '700' },

  /* Figma uzunluk satırı: 14/18 dolgu · 16 yarıçap · 2 px kenarlık · emoji 24. */
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 2,
  },
  durationEmoji: { fontSize: 24, lineHeight: 30 },
  durationBody: { flex: 1, gap: 2 },
  durationLabel: { fontSize: 15, lineHeight: 20 },
  durationSub: { fontSize: 13, lineHeight: 18 },

  religiousRow: { flexDirection: 'row', alignItems: 'center' },
  religiousBody: { flex: 1, gap: 2 },
  religiousText: { fontSize: 12, lineHeight: 17 },
});
