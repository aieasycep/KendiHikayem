/**
 * Skeleton — yüklenme yer tutucusu.
 *
 * Nabız animasyonu YAVAŞTIR (yatma saati — göz yormaz). Ekranlar spinner yerine
 * gelecek içeriğin silüetini gösterir; kullanıcı neyin gelmekte olduğunu görür.
 */

import { Animated, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect, useRef, type ReactElement } from 'react';

import { useTheme } from '../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Kapak/kare görsel yer tutucusu için en-boy oranı (height yerine). */
  aspectRatio?: number;
  rounded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = '100%',
  height = 16,
  aspectRatio,
  rounded = false,
  style,
}: SkeletonProps): ReactElement {
  const { colors, radius } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          ...(aspectRatio !== undefined ? { aspectRatio } : { height }),
          backgroundColor: colors.surfaceMuted,
          borderRadius: rounded ? radius.cover : radius.sm,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}
