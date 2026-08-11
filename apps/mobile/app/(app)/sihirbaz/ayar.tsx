import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { PageCount } from '@kendihikayem/contract';

import { Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
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
      <StepBar step={5} total={7} labelTr="Adım 5 / 7 — İnce ayar" />
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
        <View style={styles.religiousRow}>
          <View style={styles.religiousBody}>
            <Text style={styles.religiousTitle}>Dini öğeler yer alabilsin</Text>
            <Text style={styles.religiousText}>
              Varsayılan olarak kapalıdır; yalnızca siz açarsanız bayram, dua gibi öğeler
              geçebilir.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Dini içerik"
            onValueChange={(value) => {
              patch({ religiousOptIn: value });
            }}
            thumbColor={draft.religiousOptIn ? colors.primary : colors.surface}
            trackColor={{ false: colors.border, true: '#F2C879' }}
            value={draft.religiousOptIn}
          />
        </View>
      </Card>

      <Card>
        <Heading>Sizden bir fikir (isteğe bağlı)</Heading>
        <TextInput
          accessibilityLabel="Serbest fikir"
          maxLength={200}
          multiline
          onChangeText={(value) => {
            patch({ freeIdeaTr: value });
          }}
          placeholder="Örn. Geçen hafta ilk kez bisiklete bindi, onu da katalım."
          placeholderTextColor={colors.inkMuted}
          style={styles.ideaInput}
          value={draft.freeIdeaTr ?? ''}
        />
        <Caption>{`${String((draft.freeIdeaTr ?? '').length)} / 200`}</Caption>
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
  religiousRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  religiousBody: { flex: 1, gap: 2 },
  religiousTitle: { ...typography.label, color: colors.ink },
  religiousText: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.inkMuted },
  ideaInput: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
