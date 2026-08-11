/**
 * Button — tek birincil eylem kuralının taşıyıcısı.
 *
 * `variant="primary"` bir ekranda EN FAZLA BİR KEZ görünmelidir (SPEC §11.0
 * "tek ana eylem"). İkincil işler `secondary`/`ghost`, yıkıcı işler `danger`.
 *
 * GÖRÜNÜM — Figma birebir: birincil buton tasarımdaki CTA'dır
 * (`Onboarding/StoryCreation/StoryResult/VoiceStudio` ekranlarında aynı):
 *   dolgu   linear-gradient(135deg, #9B7FD4 → #7C5CBF)
 *   yarıçap 20 · dikey dolgu 18 · yazı Nunito 800 / 17 pt beyaz
 *   gölge   0 8px 24px rgba(124,92,191,0.35)
 * Degrade react-native-svg ile çizilir (packages/ui'nin mevcut bağımlılığı);
 * fontlar yüklenmeden sistem 800 ağırlığı kullanılır.
 *
 * NOT (tasarım/erişilebilirlik çelişkisi): tasarım beyaz metni her iki temada da
 * bu mor degradenin üstüne basar; kontrast üst uçta (#9B7FD4) AA'nın altındadır.
 * Tasarıma birebir uymak açık karardır — bkz. tokens/contrast.test.ts notları.
 *
 * `busy` durumu buton içinde küçük bir dönence gösterir; bu yalnızca 1-2 saniyelik
 * istek onayı içindir. 20 saniyeyi aşabilecek işler butonda DEĞİL,
 * `JobProgressCard` ile beklenir (spinner yok, bildirim var).
 */

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useState, type ReactElement } from 'react';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../theme';
import { fontFamilies } from '../tokens/typography';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Kısa süreli istek beklemesi. Uzun işler için JobProgressCard kullanın. */
  busy?: boolean;
  /** Satır içine sıkışan küçük buton (kart eylemleri). */
  compact?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/* Figma CTA degradesi — gündüz ve gece ekranlarında AYNI (VoiceStudio dahil). */
const GRADIENT_START = '#9B7FD4';
const GRADIENT_END = '#7C5CBF';

/** Aynı ekranda birden çok buton olabilir; degrade id'si çakışmasın. */
let gradientSeq = 0;

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  compact = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps): ReactElement {
  const { colors, radius, touchTarget, fontsReady } = useTheme();
  const [gradientId] = useState(() => {
    gradientSeq += 1;
    return `khButtonGradient${gradientSeq}`;
  });
  const blocked = disabled || busy;
  const isPrimary = variant === 'primary';

  const backgroundFor = (pressed: boolean): string => {
    // Degrade Svg katmanında; buradaki düz mor iOS gölge yolu + yedek dolgudur.
    if (isPrimary) return GRADIENT_END;
    if (variant === 'danger') return pressed ? colors.surfaceMuted : 'transparent';
    if (variant === 'secondary') return pressed ? colors.surfaceMuted : colors.surface;
    return pressed ? colors.surfaceMuted : 'transparent';
  };

  const borderColor =
    variant === 'secondary' ? colors.border : variant === 'danger' ? colors.danger : 'transparent';

  const textTone = variant === 'danger' ? 'danger' : 'default';
  const borderRadius = compact ? radius.sm : radius.lg; // Figma: tam genişlik buton 20

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy }}
      accessibilityHint={accessibilityHint}
      hitSlop={compact ? touchTarget.hitSlop : undefined}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius,
          minHeight: compact ? 40 : touchTarget.minHeight + 4,
          paddingVertical: compact ? 0 : 18, // Figma: padding 18px
          paddingHorizontal: compact ? 16 : 24,
          backgroundColor: backgroundFor(pressed),
          borderWidth: variant === 'secondary' || variant === 'danger' ? 1 : 0,
          borderColor,
          opacity: blocked ? 0.55 : pressed && isPrimary ? 0.9 : 1,
        },
        isPrimary && !blocked && styles.primaryShadow,
        style,
      ]}
    >
      {isPrimary && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius }, styles.gradientClip]}
        >
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <Defs>
              {/* 135° = sol üstten sağ alta */}
              <SvgLinearGradient id={gradientId} x1={0} y1={0} x2={1} y2={1}>
                <Stop offset={0} stopColor={GRADIENT_START} />
                <Stop offset={1} stopColor={GRADIENT_END} />
              </SvgLinearGradient>
            </Defs>
            <Rect x={0} y={0} width={1} height={1} fill={`url(#${gradientId})`} />
          </Svg>
        </View>
      )}
      {busy ? (
        <ActivityIndicator size="small" color={isPrimary ? '#FFFFFF' : colors.ink} />
      ) : (
        <Text
          variant={compact ? 'label' : 'bodyStrong'}
          tone={textTone}
          numberOfLines={1}
          style={
            isPrimary
              ? [
                  styles.primaryLabel,
                  fontsReady
                    ? { fontFamily: fontFamilies.bodyExtraBold }
                    : styles.primaryLabelFallback,
                ]
              : undefined
          }
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  gradientClip: { overflow: 'hidden' },
  /* Figma: 0 8px 24px rgba(124,92,191,0.35) */
  primaryShadow: {
    shadowColor: GRADIENT_END,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  /* Figma: Nunito 800 · 17 · beyaz · letterSpacing 0.01em */
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: 0.17,
  },
  primaryLabelFallback: { fontWeight: '800' },
});
