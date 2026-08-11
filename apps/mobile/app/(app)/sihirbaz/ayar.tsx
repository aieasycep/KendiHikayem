import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import type { PageCount } from '@kendihikayem/contract';
import { Input, Text, useTheme } from '@kendihikayem/ui';

import { Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { Chip, ChipRow, StepBar } from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';

const PAGE_COUNTS: PageCount[] = [12, 14, 16];

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

/**
 * W05 — İnce ayar: sayfa sayısı, hikayenin taşıyacağı değer, kültürel etiketler
 * ve dini içerik. Dini içerik OPT-IN'dir ve VARSAYILAN KAPALIDIR (SPEC §11.1) —
 * yalnızca ebeveyn bu anahtarı açarsa dini öğe üretilebilir.
 */
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
      <StepBar step={5} total={7} labelTr="Yeni Masal · İnce ayar" />
      <Title>Masalı size göre ayarlayalım</Title>

      <Card>
        <Heading>Uzunluk</Heading>
        <ChipRow>
          {PAGE_COUNTS.map((count) => (
            <Chip
              key={count}
              label={`${String(count)} sayfa`}
              selected={draft.pageCount === count}
              onPress={() => {
                patch({ pageCount: count });
              }}
            />
          ))}
        </ChipRow>
        <Caption>12 sayfa uyku öncesi için ideal; 16 sayfa daha uzun bir macera.</Caption>
      </Card>

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

      <Card>
        <Input
          label="Sizden bir fikir (isteğe bağlı)"
          maxLength={200}
          multiline
          onChangeText={(value) => {
            patch({ freeIdeaTr: value });
          }}
          placeholder="Örn. Geçen hafta ilk kez bisiklete bindi, onu da katalım."
          value={draft.freeIdeaTr ?? ''}
          hintTr={`${String((draft.freeIdeaTr ?? '').length)} / 200`}
        />
      </Card>

      <PrimaryButton
        label="Devam et"
        onPress={() => {
          router.push('/(app)/sihirbaz/ses-secim');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  religiousRow: { flexDirection: 'row', alignItems: 'center' },
  religiousBody: { flex: 1, gap: 2 },
  religiousText: { fontSize: 12, lineHeight: 17 },
});
