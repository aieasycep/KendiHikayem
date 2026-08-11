/**
 * ErrorState — hata durumu.
 *
 * Sözleşme kuralı: her hata gövdesi `ApiError`dır ve `messageTr` DOĞRUDAN
 * gösterilebilir (somut talimat içerir). Bu bileşen o metni basar; teknik
 * `detail` alanını asla göstermez. `retryable` ise "Tekrar dene" butonu çıkar.
 *
 * Ağ tamamen yoksa (fetch fırlatırsa) `offline` varyantı kullanılır — rakibin
 * en yıkıcı hatası "internet gidince hiçbir şey yüklenmiyordu" idi; bizim hata
 * ekranımız bile kullanıcıyı indirilen masallara yönlendirir.
 */

import { StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export interface ErrorStateProps {
  /** Sözleşmeden gelen Türkçe mesaj. Yoksa bağlantı metni kullanılır. */
  messageTr?: string;
  onRetry?: () => void;
  /** Ağ yok görünümü: ikon ve yönlendirme değişir. */
  offline?: boolean;
  /** Çevrimdışı içeriğe köprü ("İndirilenlere git"). */
  offlineActionLabelTr?: string;
  onOfflineAction?: () => void;
  /** Kart içinde küçük gösterim (tam ekran yerine). */
  compact?: boolean;
}

export function ErrorState({
  messageTr,
  onRetry,
  offline = false,
  offlineActionLabelTr,
  onOfflineAction,
  compact = false,
}: ErrorStateProps): ReactElement {
  const { spacing } = useTheme();

  const fallback = offline
    ? 'İnternet bağlantısı yok gibi görünüyor. İndirdiğiniz masallar her zaman açılır.'
    : 'Bir sorun oluştu. Birkaç saniye sonra tekrar deneyin.';

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        { padding: compact ? spacing.md : spacing.xl, gap: spacing.md },
      ]}
    >
      {!compact && (
        <Text style={styles.icon} accessibilityElementsHidden>
          {offline ? '📴' : '🫧'}
        </Text>
      )}
      <Text variant={compact ? 'body' : 'heading'} center={!compact}>
        {offline ? 'Çevrimdışısınız' : 'Bir şeyler ters gitti'}
      </Text>
      <Text variant={compact ? 'caption' : 'body'} tone="muted" center={!compact}>
        {messageTr ?? fallback}
      </Text>
      <View style={[styles.actions, { gap: spacing.sm }]}>
        {onRetry !== undefined ? (
          <Button label="Tekrar dene" variant="secondary" compact onPress={onRetry} />
        ) : null}
        {offlineActionLabelTr !== undefined && onOfflineAction !== undefined ? (
          <Button label={offlineActionLabelTr} compact onPress={onOfflineAction} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 48, lineHeight: 58 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
