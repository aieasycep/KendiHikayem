/**
 * Sheet — alt sayfa (bottom sheet).
 *
 * Saf RN Modal + Animated ile yazılmıştır; ek bağımlılık yoktur. Tek elle
 * kullanım için eylemler ekranın altında toplanır — sheet bu ürünün ana
 * ikincil-akış yüzeyidir (P02 metin düzenleme, P03 görsel yenileme, rıza
 * geri alma onayı...).
 */

import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Sheet başlığı — ekran okuyucu için de kullanılır. */
  titleTr: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, titleTr, children }: SheetProps): ReactElement {
  const { colors, radius, spacing, motion } = useTheme();
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: motion.standard,
      useNativeDriver: true,
    }).start();
  }, [open, slide, motion.standard]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [480, 0] });

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kapat"
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.avoider}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surfaceRaised,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                padding: spacing.lg,
                paddingBottom: spacing.xl,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text variant="heading" accessibilityRole="header">
              {titleTr}
            </Text>
            <View style={{ gap: spacing.md }}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  avoider: { justifyContent: 'flex-end' },
  sheet: { gap: 16, maxHeight: '88%' },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 4,
  },
});
