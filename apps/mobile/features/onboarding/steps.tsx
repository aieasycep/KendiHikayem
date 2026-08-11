/**
 * Shared wizard step bodies — used by BOTH flows:
 *   S03/S04/S05 (first-run onboarding) and W02/W03/W04 (registered wizard).
 * One implementation means the two flows can never drift apart.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { AgeBand } from '@kendihikayem/contract';

import { Body, Card, Heading } from '../../components/ui';
import { colors, radius, spacing } from '../../constants/theme';
import { useArtStyles, useCharacterOptions, useThemes } from './catalogHooks';
import { AsyncGate, Chip, ChipRow, PrivacyPromise, SelectCard } from './components';

/* ── Tema ızgarası (S03 / W02) ───────────────────────────────── */

export function ThemeGrid({
  ageBand,
  selectedCode,
  onSelect,
}: {
  ageBand: AgeBand;
  selectedCode?: string;
  onSelect: (code: string, isReligious: boolean) => void;
}): ReactNode {
  const themes = useThemes(ageBand);
  return (
    <AsyncGate
      isLoading={themes.isLoading}
      error={themes.error}
      data={themes.data}
      emptyTr="Bu yaş bandı için tema bulunamadı. Yaş bandını değiştirip tekrar deneyin."
      onRetry={() => void themes.refetch()}
    >
      {(items) => (
        <View style={styles.grid}>
          {items.map((theme) => (
            <SelectCard
              key={theme.code}
              icon={theme.icon}
              titleTr={theme.titleTr}
              subtitleTr={theme.subtitleTr}
              footerTr={theme.sampleFirstLineTr}
              selected={selectedCode === theme.code}
              onPress={() => {
                onSelect(theme.code, theme.isReligious);
              }}
            />
          ))}
        </View>
      )}
    </AsyncGate>
  );
}

/* ── Sanat stili ızgarası (S05 / W04) ────────────────────────── */

/** Preview image with a deterministic color fallback when the CDN is unreachable. */
function StylePreview({ url, code }: { url: string; code: string }): ReactNode {
  const [failed, setFailed] = useState(false);
  const fallbackHue = Math.abs([...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % 360;
  if (failed) {
    return (
      <View
        style={[styles.preview, { backgroundColor: `hsl(${fallbackHue.toString()}, 45%, 82%)` }]}
        accessibilityLabel="Stil önizlemesi yüklenemedi"
      />
    );
  }
  return (
    <Image
      accessibilityLabel="Stil önizlemesi"
      source={{ uri: url }}
      style={styles.preview}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

export function StyleGrid({
  selectedCode,
  onSelect,
}: {
  selectedCode?: string;
  onSelect: (code: string) => void;
}): ReactNode {
  const artStyles = useArtStyles();
  return (
    <AsyncGate
      isLoading={artStyles.isLoading}
      error={artStyles.error}
      data={artStyles.data}
      emptyTr="Stil kataloğu şu an boş. Biraz sonra tekrar deneyin."
      onRetry={() => void artStyles.refetch()}
    >
      {(items) => (
        <View style={styles.grid}>
          {items.map((style) => (
            <View key={style.code} style={styles.cell}>
              <StylePreview url={style.preview.url} code={style.code} />
              <SelectCard
                titleTr={style.titleTr}
                subtitleTr={style.descriptionTr}
                selected={selectedCode === style.code}
                onPress={() => {
                  onSelect(style.code);
                }}
              />
            </View>
          ))}
        </View>
      )}
    </AsyncGate>
  );
}

/* ── Karakter Kurucu alanları (S04 / W03) ────────────────────── */

export function CharacterBuilderFields({
  ageBand,
  values,
  onSelect,
}: {
  ageBand: AgeBand;
  values: Record<string, string>;
  onSelect: (field: string, code: string) => void;
}): ReactNode {
  const options = useCharacterOptions(ageBand);

  return (
    <AsyncGate
      isLoading={options.isLoading}
      error={options.error}
      data={options.data}
      onRetry={() => void options.refetch()}
      loadingTr="Karakter seçenekleri yükleniyor…"
    >
      {(data) => (
        <>
          <PrivacyPromise textTr={data.privacyNoteTr} />
          <Body>
            Görünüşü aşağıdan seçin; çizer bu seçimlerden yola çıkarak üç farklı kahraman
            çizecek, beğendiğinizi siz seçeceksiniz.
          </Body>
          {data.fields.map((field) => (
            <Card key={field.field}>
              <Heading>
                {field.labelTr}
                {field.required ? ' *' : ''}
              </Heading>
              <ChipRow>
                {field.options.map((option) => (
                  <Chip
                    key={option.code}
                    label={option.labelTr}
                    swatchHex={option.swatchHex}
                    selected={values[field.field] === option.code}
                    onPress={() => {
                      onSelect(field.field, option.code);
                    }}
                  />
                ))}
              </ChipRow>
            </Card>
          ))}
        </>
      )}
    </AsyncGate>
  );
}

/** Required-state helper for screens (same logic as the fields component). */
export function useCharacterRequiredState(
  ageBand: AgeBand,
  values: Record<string, string>,
): boolean {
  const options = useCharacterOptions(ageBand);
  const requiredFields = options.data?.fields.filter((field) => field.required) ?? [];
  return requiredFields.some((field) => values[field.field] === undefined);
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexGrow: 1, flexBasis: '45%', gap: spacing.xs },
  preview: {
    width: '100%',
    height: 110,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
