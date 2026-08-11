import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatTryTr, type Order, type OrderStatus } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  MediaImage,
  NoticeBox,
  Row,
  Screen,
  Skeleton,
  Text,
  useTheme,
} from '@kendihikayem/ui';

import { useCancelOrder, useOrder, useOrders } from '../../../../features/print/hooks';

const STATUS_TR: Record<OrderStatus, string> = {
  odeme_bekliyor: 'Ödeme bekleniyor',
  odendi: 'Ödendi',
  uretimde: 'Üretimde',
  baskida: 'Baskıda',
  kargoya_verildi: 'Kargoya verildi',
  teslim_edildi: 'Teslim edildi',
  iptal_edildi: 'İptal edildi',
  iade_edildi: 'İade edildi',
};

const STATUS_TONE: Record<OrderStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'accent'> = {
  odeme_bekliyor: 'warning',
  odendi: 'accent',
  uretimde: 'accent',
  baskida: 'accent',
  kargoya_verildi: 'accent',
  teslim_edildi: 'success',
  iptal_edildi: 'danger',
  iade_edildi: 'danger',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function OrderDetail({ order }: { order: Order }): ReactNode {
  const { colors } = useTheme();
  const cancelOrder = useCancelOrder();
  const cancellable = order.status === 'odeme_bekliyor' || order.status === 'odendi';

  return (
    <>
      <Card>
        <Row gap="md">
          <MediaImage
            uri={order.cover?.url}
            placeholderLabelTr={order.storyTitle}
            aspectRatio={1}
            altTr=""
            style={styles.cover}
          />
          <View style={styles.headerTexts}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {order.storyTitle}
            </Text>
            <Text variant="caption" tone="muted">
              {`Sipariş no: ${order.orderNo}`}
            </Text>
            <Text variant="caption" tone="muted">
              {`${order.quantity} adet · ${formatTryTr(order.totalTry as number)}`}
            </Text>
            <Badge labelTr={STATUS_TR[order.status]} tone={STATUS_TONE[order.status]} />
          </View>
        </Row>
        {order.etaDeliveryAt !== undefined ? (
          <Text variant="caption" tone="muted">
            {`Tahmini teslim: ${new Date(order.etaDeliveryAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`}
          </Text>
        ) : null}
      </Card>

      {order.status === 'odeme_bekliyor' ? (
        <NoticeBox
          tone="info"
          titleTr="Ödemeniz henüz tamamlanmadı"
          bodyTr="Ödeme sayfası açılmadıysa ya da yarıda kaldıysa bankanızdan onay gelene kadar sipariş bekletilir."
        />
      ) : null}

      {/* ── Zaman çizelgesi ────────────────────────────────── */}
      <Text variant="heading">Sipariş durumu</Text>
      <Card>
        {order.timeline.map((step, index) => (
          <Row key={`${step.at}-${index}`} gap="md" align="flex-start">
            <View style={styles.timelineMark}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: index === order.timeline.length - 1 ? colors.primary : colors.border },
                ]}
              />
              {index < order.timeline.length - 1 ? (
                <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
              ) : null}
            </View>
            <View style={styles.timelineTexts}>
              <Text variant="body">{step.statusTr}</Text>
              <Text variant="caption" tone="muted">
                {formatDate(step.at)}
              </Text>
            </View>
          </Row>
        ))}
      </Card>

      {order.tracking !== undefined ? (
        <Card>
          <Text variant="bodyStrong">Kargo takibi</Text>
          <Text variant="body">{`${order.tracking.carrier} · ${order.tracking.number}`}</Text>
          <Button
            label="Kargo sitesinde aç"
            variant="secondary"
            onPress={() => {
              if (order.tracking !== undefined) {
                void Linking.openURL(order.tracking.url).catch(() => undefined);
              }
            }}
          />
        </Card>
      ) : null}

      {cancellable ? (
        <Button
          label="Siparişi iptal et"
          variant="danger"
          busy={cancelOrder.isPending}
          onPress={() => {
            cancelOrder.mutate({ orderId: order.id as string });
          }}
        />
      ) : null}
      {cancelOrder.error !== null ? (
        <NoticeBox tone="danger" titleTr="İptal edilemedi" bodyTr={cancelOrder.error.messageTr} />
      ) : null}
    </>
  );
}

/** B08 — sipariş takibi. `orderId` verilirse detay, verilmezse sipariş listesi. */
export default function Takip(): ReactNode {
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId?: string }>();
  const router = useRouter();

  const orderQuery = useOrder(orderId);
  const ordersQuery = useOrders();

  return (
    <Screen>
      <Text variant="title">Siparişlerim</Text>

      {orderId !== undefined ? (
        orderQuery.isLoading ? (
          <>
            <Skeleton height={120} rounded />
            <Skeleton height={180} rounded />
          </>
        ) : orderQuery.data !== undefined ? (
          <OrderDetail order={orderQuery.data} />
        ) : (
          <ErrorState
            messageTr={orderQuery.error?.messageTr}
            onRetry={() => {
              void orderQuery.refetch();
            }}
          />
        )
      ) : ordersQuery.isLoading ? (
        <>
          <Skeleton height={100} rounded />
          <Skeleton height={100} rounded />
        </>
      ) : ordersQuery.isError ? (
        <ErrorState
          messageTr={ordersQuery.error.messageTr}
          onRetry={() => {
            void ordersQuery.refetch();
          }}
        />
      ) : (ordersQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon="📦"
          titleTr="Henüz siparişiniz yok"
          bodyTr="Bir masalı basılı kitaba dönüştürdüğünüzde durumunu buradan izlersiniz."
        />
      ) : (
        (ordersQuery.data ?? []).map((order) => (
          <Card
            key={order.id as string}
            onPress={() => {
              router.push({
                pathname: '/(app)/bastir/[id]/takip',
                params: { id: id ?? '', orderId: order.id as string },
              });
            }}
          >
            <Row justify="space-between">
              <Text variant="bodyStrong" numberOfLines={1} style={styles.flex1}>
                {order.storyTitle}
              </Text>
              <Badge labelTr={STATUS_TR[order.status]} tone={STATUS_TONE[order.status]} />
            </Row>
            <Text variant="caption" tone="muted">
              {`${order.orderNo} · ${order.quantity} adet · ${formatTryTr(order.totalTry as number)}`}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { width: 72 },
  headerTexts: { flex: 1, gap: 4 },
  flex1: { flex: 1 },
  timelineMark: { alignItems: 'center', width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  timelineLine: { width: 2, flex: 1, minHeight: 18, marginTop: 2 },
  timelineTexts: { flex: 1, gap: 2, paddingBottom: 8 },
});
