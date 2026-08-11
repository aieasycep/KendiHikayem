/**
 * ListRow — ayarlar/menü satırı. Sağda değer, ok veya anahtar (switch) taşır.
 * 48dp dokunma hedefi; ekran okuyucu için tek erişilebilirlik düğümü.
 */

import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface ListRowProps {
  titleTr: string;
  /** Alt satır açıklaması. */
  subtitleTr?: string;
  /** Sağda gösterilen mevcut değer ("Andika", "20 pt"). */
  valueTr?: string;
  onPress?: () => void;
  /** Anahtar satırı: değer + değişim. onPress yok sayılır. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  /** Yıkıcı satır (Hesabı Sil). */
  destructive?: boolean;
  /** Başta emoji/simge. */
  icon?: string;
  disabled?: boolean;
  testID?: string;
}

export function ListRow({
  titleTr,
  subtitleTr,
  valueTr,
  onPress,
  switchValue,
  onSwitchChange,
  destructive = false,
  icon,
  disabled = false,
  testID,
}: ListRowProps): ReactElement {
  const { colors, spacing, touchTarget } = useTheme();
  const isSwitch = switchValue !== undefined;

  const content = (
    <>
      {icon !== undefined ? (
        <Text variant="heading" accessibilityElementsHidden style={styles.icon}>
          {icon}
        </Text>
      ) : null}
      <View style={styles.texts}>
        <Text variant="body" tone={destructive ? 'danger' : 'default'}>
          {titleTr}
        </Text>
        {subtitleTr !== undefined ? (
          <Text variant="caption" tone="muted">
            {subtitleTr}
          </Text>
        ) : null}
      </View>
      {valueTr !== undefined ? (
        <Text variant="label" tone="muted">
          {valueTr}
        </Text>
      ) : null}
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
          thumbColor={colors.surface}
          accessibilityLabel={titleTr}
        />
      ) : onPress !== undefined ? (
        <Text variant="label" tone="muted" accessibilityElementsHidden>
          ›
        </Text>
      ) : null}
    </>
  );

  const rowStyle = [
    styles.row,
    {
      minHeight: touchTarget.minHeight + 8,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
      opacity: disabled ? 0.5 : 1,
    },
  ];

  if (isSwitch || onPress === undefined) {
    return (
      <View style={rowStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitleTr !== undefined ? `${titleTr}. ${subtitleTr}` : titleTr}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 32, textAlign: 'center' },
  texts: { flex: 1, gap: 2 },
});
