import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Caption, PrimaryButton, Screen, Title } from '../../components/ui';
import { spacing } from '../../constants/theme';
import { useThemes } from '../../features/onboarding/catalogHooks';
import { AsyncGate, SelectCard, StepBar } from '../../features/onboarding/components';
import { useWizardDraft } from '../../features/onboarding/draft';

/**
 * S03 — Tema kartları (SPEC §11.2, 0:35). Server-driven catalog; the sample
 * first line on each card shows the parent exactly what they will get.
 * Religious themes are listed but the CONTENT stays opt-in via W05/religiousOptIn.
 */
export default function Tema(): ReactNode {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const themes = useThemes(draft.ageBand);

  return (
    <Screen>
      <StepBar step={2} total={5} labelTr="Adım 2 / 5 — Tema" />
      <Title>Nasıl bir masal olsun?</Title>

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
                selected={draft.themeCode === theme.code}
                onPress={() => {
                  patch({ themeCode: theme.code, religiousOptIn: theme.isReligious });
                }}
              />
            ))}
          </View>
        )}
      </AsyncGate>

      <PrimaryButton
        label="Devam et"
        disabled={draft.themeCode === undefined}
        onPress={() => {
          router.push('/(onboarding)/kahraman');
        }}
      />
      <Caption>Temayı sonra değiştirebilirsiniz; taslağı görmeden hiçbir ücret alınmaz.</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
