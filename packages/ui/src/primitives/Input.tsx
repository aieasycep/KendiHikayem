/**
 * Input — etiketli metin girişi.
 *
 * Hata metni alanın ALTINDA ve somut talimat dilindedir (sözleşmedeki
 * `messageTr` kuralıyla aynı ton): "Bir hata oluştu" yasak, "İlçenizi yazın" doğru.
 */

import { TextInput, View, type TextInputProps } from 'react-native';
import { useState, type ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Somut talimat içeren Türkçe hata metni. */
  errorTr?: string;
  /** Alan altı yardım satırı. */
  hintTr?: string;
  /** Çok satırlı metin (ithaf, sayfa düzenleme). */
  multiline?: boolean;
}

export function Input({
  label,
  errorTr,
  hintTr,
  multiline = false,
  ...rest
}: InputProps): ReactElement {
  const { colors, radius, spacing, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = errorTr !== undefined && errorTr.length > 0;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.textDim}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
        style={[
          type.body,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderWidth: focused || hasError ? 2 : 1,
            borderColor: hasError ? colors.danger : focused ? colors.primary : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: multiline ? spacing.md : 12,
            minHeight: multiline ? 120 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {hasError ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {errorTr}
        </Text>
      ) : hintTr !== undefined ? (
        <Text variant="caption" tone="muted">
          {hintTr}
        </Text>
      ) : null}
    </View>
  );
}
