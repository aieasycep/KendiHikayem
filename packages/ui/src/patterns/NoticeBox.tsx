/**
 * NoticeBox — büyük, ayrı, gözden kaçmayan bilgi kutusu.
 *
 * İki hukuki zorunluluğun taşıyıcısıdır:
 *  - B06 CAYMA HAKKI: `QuoteRes.withdrawalNoticeTr` FE tarafından birebir ve
 *    AYRI BİR KUTUDA basılmak zorundadır (6502, sözleşme print.ts kat 1).
 *  - A02 rıza geri alma: `sideEffectsTr` işlemden ÖNCE gösterilir.
 *
 * Bu yüzden metin prop'u kırpılmaz, özetlenmez, katlanmaz.
 */

import { View } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { useTheme } from '../theme';
import { Text } from '../primitives/Text';

export type NoticeTone = 'info' | 'legal' | 'danger';

export interface NoticeBoxProps {
  titleTr: string;
  /** Tek metin ya da madde listesi. Birebir basılır. */
  bodyTr?: string;
  itemsTr?: string[];
  tone?: NoticeTone;
  /** Onay kutusu gibi ek içerik. */
  children?: ReactNode;
}

export function NoticeBox({
  titleTr,
  bodyTr,
  itemsTr,
  tone = 'info',
  children,
}: NoticeBoxProps): ReactElement {
  const { colors, radius, spacing } = useTheme();
  const edge = tone === 'danger' ? colors.danger : tone === 'legal' ? colors.warning : colors.accent;

  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 6,
        borderLeftColor: edge,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text variant="bodyStrong">{titleTr}</Text>
      {bodyTr !== undefined ? <Text variant="body">{bodyTr}</Text> : null}
      {itemsTr?.map((item) => (
        <Text key={item} variant="body">
          {`•  ${item}`}
        </Text>
      ))}
      {children}
    </View>
  );
}
