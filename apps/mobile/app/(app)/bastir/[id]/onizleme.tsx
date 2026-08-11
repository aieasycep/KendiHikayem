import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  Badge,
  Button,
  ErrorState,
  JobProgressCard,
  MediaImage,
  NoticeBox,
  Row,
  Screen,
  Skeleton,
  Text,
  useTheme,
} from '@kendihikayem/ui';

import { useBookBuild } from '../../../../features/print/hooks';
import { isJobTerminal, useJob } from '../../../../lib/useJob';

/**
 * B02 — spread önizleme: GERÇEK çift sayfalar, parmakla çevrilir.
 * "Bu sayfayı düzelt" doğrudan P02/P03'e köprü kurar (hikaye ekranı, ?sayfa=N).
 * Preflight uyarıları (`warningsTr`) burada gösterilir; kontrol geçmezse sipariş
 * düğmesi kilitli kalır.
 */
export default function Onizleme(): ReactNode {
  const { id, buildId, jobId } = useLocalSearchParams<{
    id: string;
    buildId: string;
    jobId?: string;
  }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();

  const { job } = useJob(jobId);
  const buildReadyByJob = jobId === undefined || isJobTerminal(job);
  const buildQuery = useBookBuild(buildReadyByJob ? buildId : undefined);
  const build = buildQuery.data;

  const [spreadIndex, setSpreadIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const pageWidth = width - spacing.md * 2;
  const halfWidth = (pageWidth - 4) / 2;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (index !== spreadIndex) setSpreadIndex(index);
  };

  const fixPage = (pageNo: number): void => {
    router.push({
      pathname: '/(app)/hikaye/[id]',
      params: { id: id ?? '', sayfa: String(pageNo) },
    });
  };

  const checksOk =
    build !== undefined &&
    build.checks.dpiOk &&
    build.checks.fontsEmbedded &&
    build.checks.safeZoneOk &&
    build.checks.bleedOk;

  return (
    <Screen>
      <Text variant="title">Önizleme</Text>

      {!buildReadyByJob || build?.status === 'building' ? (
        <>
          <JobProgressCard
            labelTr={job?.progress.labelTr ?? 'Kitap sayfaları diziliyor'}
            current={job?.progress.current}
            total={job?.progress.total}
          />
          <Skeleton aspectRatio={2} rounded />
        </>
      ) : buildQuery.isError ? (
        <ErrorState
          messageTr={buildQuery.error.messageTr}
          onRetry={() => {
            void buildQuery.refetch();
          }}
        />
      ) : build === undefined ? (
        <Skeleton aspectRatio={2} rounded />
      ) : build.status === 'failed' ? (
        <NoticeBox
          tone="danger"
          titleTr="Kitap dosyası üretilemedi"
          bodyTr="Krediniz harcanmadı. Birkaç dakika sonra baştan deneyin; sorun sürerse bize yazın."
        />
      ) : (
        <>
          <Text variant="body" tone="muted">
            Gerçek çift sayfalar — kaydırarak çevirin. Beğenmediğiniz sayfayı baskıdan önce
            düzeltebilirsiniz.
          </Text>

          {/* ── Spread çevirici ──────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            style={{ marginHorizontal: -spacing.md }}
            contentContainerStyle={{ paddingHorizontal: spacing.md }}
          >
            {build.spreads.map((spread) => (
              <View key={spread.index} style={[styles.spread, { width: pageWidth }]}>
                <MediaImage
                  uri={spread.left.url}
                  placeholderLabelTr={`${spread.index * 2 + 1}`}
                  placeholderNoteTr="Sol sayfa hazırlanıyor"
                  aspectRatio={1}
                  altTr={`${spread.index * 2 + 1}. sayfa`}
                  style={{ width: halfWidth }}
                  borderRadius={4}
                />
                <MediaImage
                  uri={spread.right.url}
                  placeholderLabelTr={`${spread.index * 2 + 2}`}
                  placeholderNoteTr="Sağ sayfa hazırlanıyor"
                  aspectRatio={1}
                  altTr={`${spread.index * 2 + 2}. sayfa`}
                  style={{ width: halfWidth }}
                  borderRadius={4}
                />
              </View>
            ))}
          </ScrollView>

          {/* Sayfa göstergesi + düzeltme köprüsü */}
          <Row justify="space-between">
            <Text variant="caption" tone="muted">
              {`${spreadIndex + 1}. çift sayfa / ${build.spreads.length}`}
            </Text>
            <View style={[styles.dots, { gap: 4 }]}>
              {build.spreads.map((spread) => (
                <View
                  key={spread.index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        spread.index === spreadIndex ? colors.primary : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          </Row>
          <Row gap="sm">
            <View style={styles.flex1}>
              <Button
                label={`${spreadIndex * 2 + 1}. sayfayı düzelt`}
                variant="secondary"
                compact
                onPress={() => {
                  fixPage(spreadIndex * 2 + 1);
                }}
              />
            </View>
            <View style={styles.flex1}>
              <Button
                label={`${spreadIndex * 2 + 2}. sayfayı düzelt`}
                variant="secondary"
                compact
                onPress={() => {
                  fixPage(spreadIndex * 2 + 2);
                }}
              />
            </View>
          </Row>

          {/* ── Preflight ────────────────────────────────────── */}
          {build.qr.enabled ? (
            <Badge
              labelTr={`Sesli QR açık — ${build.qr.renditionLabel ?? 'seçili ses'}`}
              tone="accent"
              icon="🔊"
            />
          ) : null}
          {build.warningsTr.length > 0 ? (
            <NoticeBox tone="legal" titleTr="Baskı öncesi notlar" itemsTr={build.warningsTr} />
          ) : null}
          {!checksOk ? (
            <NoticeBox
              tone="danger"
              titleTr="Baskı kontrolleri geçmedi"
              bodyTr="Dosyada çözünürlük veya güvenli alan sorunu var. Sayfaları düzeltin; kitap yeniden hazırlanacak."
            />
          ) : null}

          <Button
            label="Siparişe geç"
            disabled={!checksOk}
            onPress={() => {
              router.push({
                pathname: '/(app)/bastir/[id]/siparis',
                params: { id: id ?? '', buildId: buildId ?? '' },
              });
            }}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', gap: 4 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex1: { flex: 1 },
});
