/**
 * Screen — güvenli alanlı ekran kabuğu.
 *
 * Kaydırılabilir (varsayılan) ya da sabit (`scroll={false}`, oynatıcı gibi tam
 * ekran yüzeyler). Zemin rengi temadan gelir; koyu temalı bir alt ağaçta
 * (ThemeScope) zemin de otomatik koyulaşır.
 */

import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactElement, ReactNode } from 'react';

import { useTheme } from '../theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Kenar boşluğunu kapat (tam ekran görsel). */
  flush?: boolean;
  /** Alt kenarı da güvenli alana al (sekmesiz tam ekranlar). */
  includeBottom?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  flush = false,
  includeBottom = false,
  style,
  testID,
}: ScreenProps): ReactElement {
  const { colors, spacing } = useTheme();
  const edges = includeBottom
    ? (['top', 'left', 'right', 'bottom'] as const)
    : (['top', 'left', 'right'] as const);

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: colors.background }]}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            !flush && { padding: spacing.md, paddingBottom: spacing.xxl },
            { gap: spacing.md },
            style,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, !flush && { padding: spacing.md }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
});
