/**
 * @kendihikayem/ui — tasarım sistemi. Sahibi: F2 (SPEC §12).
 *
 * Katmanlar:
 *   tokens/     renk, tipografi, boşluk, yarıçap, hareket — ham değerler
 *   theme       ThemeProvider / ThemeScope / useTheme — gündüz + gece
 *   primitives/ Text, Button, Card, Chip, Input, Sheet, ProgressBar, Skeleton,
 *               EmptyState, ErrorState, Badge, ListRow, Screen, Row
 *   patterns/   MediaImage (404'a dayanıklı görsel), JobProgressCard
 *               ("spinner yok"), NoticeBox (cayma/rıza kutusu), CheckRow
 *               (ön-işaretsiz onay kutusu)
 *
 * KULLANIM KURALLARI (tasarım anayasası, SPEC §11.0):
 *  - Bir ekranda EN FAZLA BİR `<Button variant="primary">`.
 *  - Uzun işler `JobProgressCard` ile beklenir; `ActivityIndicator` yalnız
 *    1-2 saniyelik istek onayı içindir.
 *  - Türkçe isim çekimi `@kendihikayem/shared` `possessive()`/`dative()` ile
 *    yapılır; elle "'in/'nın" YAZILMAZ.
 *  - Görseller `MediaImage` ile basılır — çıplak `<Image>` 404'te ekranı bozar.
 */

export const PACKAGE_NAME = '@kendihikayem/ui' as const;

// tokens
export { palette, light, dark, type ColorRoles } from './tokens/colors';
export {
  typeScale,
  readerFontFamily,
  readerTextStyle,
  type TypeVariant,
} from './tokens/typography';
export { spacing, radius, touchTarget, motion, elevation } from './tokens/layout';

// theme
export {
  ThemeProvider,
  ThemeScope,
  useTheme,
  lightTheme,
  darkTheme,
  type Theme,
  type ThemeMode,
} from './theme';

// primitives
export { Text, type UiTextProps, type TextTone } from './primitives/Text';
export { Button, type ButtonProps, type ButtonVariant } from './primitives/Button';
export { Card, type CardProps } from './primitives/Card';
export { Chip, type ChipProps } from './primitives/Chip';
export { Input, type InputProps } from './primitives/Input';
export { Sheet, type SheetProps } from './primitives/Sheet';
export { ProgressBar, type ProgressBarProps } from './primitives/ProgressBar';
export { Skeleton, type SkeletonProps } from './primitives/Skeleton';
export { EmptyState, type EmptyStateProps } from './primitives/EmptyState';
export { ErrorState, type ErrorStateProps } from './primitives/ErrorState';
export { Badge, type BadgeProps, type BadgeTone } from './primitives/Badge';
export { ListRow, type ListRowProps } from './primitives/ListRow';
export { Screen, type ScreenProps } from './primitives/Screen';
export { Row, type RowProps } from './primitives/Row';

// patterns
export { MediaImage, type MediaImageProps } from './patterns/MediaImage';
export { JobProgressCard, type JobProgressCardProps } from './patterns/JobProgressCard';
export { NoticeBox, type NoticeBoxProps, type NoticeTone } from './patterns/NoticeBox';
export { CheckRow, type CheckRowProps } from './patterns/CheckRow';
