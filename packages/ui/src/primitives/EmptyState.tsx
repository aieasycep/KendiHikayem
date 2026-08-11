/**
 * EmptyState — boş durum.
 *
 * Boş durum bir HATA değildir; bir davettir. Ton sıcak, eylem tek ve nettir
 * (L03: "İlk masalınızı oluşturun").
 */

import { StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  /** Büyük emoji/simge — görsel ağırlık için. */
  icon?: string;
  titleTr: string;
  bodyTr?: string;
  actionLabelTr?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = '🌙',
  titleTr,
  bodyTr,
  actionLabelTr,
  onAction,
}: EmptyStateProps): ReactElement {
  const { spacing } = useTheme();

  return (
    <View style={[styles.wrap, { padding: spacing.xl, gap: spacing.md }]}>
      <Text style={styles.icon} accessibilityElementsHidden>
        {icon}
      </Text>
      <Text variant="heading" center accessibilityRole="header">
        {titleTr}
      </Text>
      {bodyTr !== undefined ? (
        <Text variant="body" tone="muted" center>
          {bodyTr}
        </Text>
      ) : null}
      {actionLabelTr !== undefined && onAction !== undefined ? (
        <Button label={actionLabelTr} onPress={onAction} style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 56, lineHeight: 68 },
});
