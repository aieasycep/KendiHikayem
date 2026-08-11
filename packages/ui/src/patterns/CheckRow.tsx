/**
 * CheckRow — ön-işaretsiz onay kutusu satırı.
 *
 * Hukuki kural (SPEC §7 adım 3, §10): açık rıza kutuları ÖN-İŞARETSİZ başlar ve
 * her kutu ayrı kayıttır. Bu bileşenin `checked` başlangıcını true yapmak
 * istemcinin elinde değildir — varsayılan prop yoktur, durum daima dışarıdan
 * (başlangıçta false) verilir. Cayma hakkı onayı (B06) da aynı bileşeni kullanır.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from '../primitives/Text';

export interface CheckRowProps {
  labelTr: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

export function CheckRow({
  labelTr,
  checked,
  onChange,
  disabled = false,
  testID,
}: CheckRowProps): ReactElement {
  const { colors, radius, spacing, touchTarget } = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={labelTr}
      disabled={disabled}
      hitSlop={touchTarget.hitSlop}
      onPress={() => {
        onChange(!checked);
      }}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          paddingVertical: spacing.sm,
          opacity: disabled ? 0.5 : 1,
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
          borderRadius: radius.sm,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderRadius: radius.sm,
            borderColor: checked ? colors.primary : colors.inkMuted,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked ? (
          <Text variant="label" tone="onPrimary" accessibilityElementsHidden>
            ✓
          </Text>
        ) : null}
      </View>
      <Text variant="body" style={styles.label}>
        {labelTr}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  box: {
    width: 28,
    height: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  label: { flex: 1 },
});
