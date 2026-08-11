/**
 * ProgressBar — ilerleme çubuğu.
 *
 * SÖZLEŞME KURALI (jobs.ts): ilerleme YÜZDE değil NE OLDUĞUDUR. Bu bileşen
 * yüzde metni BASMAZ; `labelTr` zorunludur ve çubuğun üstünde gösterilir
 * ("Elif'in odası çiziliyor"). Çubuk yalnızca görsel histir.
 */

import { Animated, StyleSheet, View } from 'react-native';
import { useEffect, useState, type ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface ProgressBarProps {
  /** 0..1. Bilinmiyorsa vermeyin; belirsiz (sürünen) animasyon oynar. */
  value?: number;
  /** Ekranda birebir gösterilen Türkçe durum cümlesi. */
  labelTr: string;
  /** İkincil satır (ör. "3 / 12 sayfa hazır"). */
  detailTr?: string;
}

export function ProgressBar({ value, labelTr, detailTr }: ProgressBarProps): ReactElement {
  const { colors, radius, spacing, motion } = useTheme();
  const [fill] = useState(() => new Animated.Value(0));
  const [crawl] = useState(() => new Animated.Value(0));
  const indeterminate = value === undefined;

  useEffect(() => {
    if (!indeterminate) {
      Animated.timing(fill, {
        toValue: Math.max(0, Math.min(1, value ?? 0)),
        duration: motion.gentle,
        useNativeDriver: false,
      }).start();
    }
  }, [value, indeterminate, fill, motion.gentle]);

  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(crawl, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(crawl, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [indeterminate, crawl]);

  return (
    <View
      style={{ gap: spacing.xs }}
      accessibilityRole="progressbar"
      accessibilityLabel={labelTr}
      accessibilityValue={
        indeterminate ? undefined : { min: 0, max: 100, now: Math.round((value ?? 0) * 100) }
      }
    >
      <Text variant="label">{labelTr}</Text>
      {detailTr !== undefined ? (
        <Text variant="caption" tone="muted">
          {detailTr}
        </Text>
      ) : null}
      <View
        style={[
          styles.track,
          { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill },
        ]}
      >
        {indeterminate ? (
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
                width: '35%',
                transform: [
                  {
                    translateX: crawl.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-80, 240],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : (
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
                width: fill.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['3%', '100%'],
                }),
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, overflow: 'hidden' },
  fill: { height: '100%' },
});
