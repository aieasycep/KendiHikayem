import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Image } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { Caption, PrimaryButton, Screen, Title } from '../../components/ui';
import { colors, radius, spacing } from '../../constants/theme';
import { useArtStyles } from '../../features/onboarding/catalogHooks';
import { AsyncGate, SelectCard, StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';

/**
 * S05 — Sanat stili (SPEC §11.2, 1:45). Four fixed cards from the catalog; free
 * style text is impossible by design (STYLE_DNA lives server-side, SPEC §8.1 ②).
 * Mock preview URLs are dead on purpose — the fallback swatch is the tested path.
 */
export default function Stil(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const artStyles = useArtStyles();

  return (
    <Screen>
      <StepBar step={4} total={5} labelTr="Adım 4 / 5 — Çizim stili" />
      <Title>Hangi çizim stili?</Title>

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
                  selected={draft.artStyleCode === style.code}
                  onPress={() => {
                    patch({ artStyleCode: style.code });
                  }}
                />
              </View>
            ))}
          </View>
        )}
      </AsyncGate>

      <PrimaryButton
        label="Devam et"
        disabled={draft.artStyleCode === undefined}
        onPress={() => {
          router.push('/(onboarding)/ozet');
        }}
      />
      <Caption>Bütün kitap tek stilde çizilir; kahraman her sayfada aynı görünür.</Caption>
    </Screen>
  );
}

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
