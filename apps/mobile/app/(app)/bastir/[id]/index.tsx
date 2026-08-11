import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { formatTryTr } from '@kendihikayem/contract';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Input,
  ListRow,
  NoticeBox,
  Row,
  Screen,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useBookFormats, useCreateBookBuild } from '../../../../features/print/hooks';
import { useRenditions } from '../../../../features/player/hooks';
import { useApproveStory, useStory } from '../../../../features/library/hooks';

/**
 * B01 format seçimi + B03 ithaf + B04 QR ayarı.
 * "Kitabı hazırla" 4K üretimi başlatır (en pahalı adım) — hikaye onaysızsa
 * 409 STORY_NOT_APPROVED gelir ve onay kısayolu gösterilir.
 */
export default function BastirBaslangic(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const storyQuery = useStory(id);
  const formatsQuery = useBookFormats();
  const renditions = useRenditions(id);
  const createBuild = useCreateBookBuild();
  const approveStory = useApproveStory();

  const [formatCode, setFormatCode] = useState<string | undefined>(undefined);
  const [dedication, setDedication] = useState('');
  const [includeQr, setIncludeQr] = useState(false);
  const [qrRenditionId, setQrRenditionId] = useState<string | undefined>(undefined);

  const formats = formatsQuery.data ?? [];
  const selectedFormat = formats.find((f) => f.code === formatCode) ?? formats[0];
  const usableRenditions = (renditions.data ?? []).filter(
    (r) => r.status === 'succeeded' || r.status === 'stale',
  );
  const notApproved = storyQuery.data !== undefined && storyQuery.data.status !== 'approved';

  return (
    <Screen>
      <Text variant="title">Kitabı bastır</Text>
      <Text variant="body" tone="muted">
        {storyQuery.data?.title !== undefined
          ? `"${storyQuery.data.title}" gerçek bir kitaba dönüşüyor.`
          : 'Masalınız gerçek bir kitaba dönüşüyor.'}
      </Text>

      {notApproved ? (
        <NoticeBox
          tone="info"
          titleTr="Önce hikayeyi onaylayın"
          bodyTr="Baskı dosyası, onayladığınız son sürümden üretilir. Önce hikaye ekranında sayfaları gözden geçirip onaylayın."
        >
          <Button
            label="Hikayeyi onayla"
            busy={approveStory.isPending}
            onPress={() => {
              approveStory.mutate({ storyId: id ?? '' });
            }}
          />
        </NoticeBox>
      ) : null}

      {/* ── B01 Format ─────────────────────────────────────── */}
      <Text variant="heading">Format</Text>
      {formatsQuery.isLoading ? (
        <Skeleton height={120} rounded />
      ) : formatsQuery.isError ? (
        <ErrorState
          compact
          messageTr={formatsQuery.error.messageTr}
          onRetry={() => {
            void formatsQuery.refetch();
          }}
        />
      ) : (
        formats.map((format) => (
          <Card
            key={format.code}
            selected={selectedFormat?.code === format.code}
            onPress={() => {
              setFormatCode(format.code);
            }}
          >
            <Row justify="space-between">
              <Text variant="bodyStrong">{format.titleTr}</Text>
              <Text variant="bodyStrong" tone="accent">
                {formatTryTr(format.basePriceTry as number)}
              </Text>
            </Row>
            <Text variant="caption" tone="muted">
              {`${format.trimMm[0] / 10}×${format.trimMm[1] / 10} cm · ${format.pageCount} sayfa · ${format.bindingTr} · ${format.paperTr}`}
            </Text>
            <Text variant="caption" tone="muted">
              {`Tahmini üretim + kargo: ${format.etaBusinessDays[0]}–${format.etaBusinessDays[1]} iş günü`}
            </Text>
          </Card>
        ))
      )}

      {/* ── B03 İthaf ──────────────────────────────────────── */}
      <Text variant="heading">İthaf</Text>
      <Input
        label="Kitabın ilk sayfasına özel notunuz (isteğe bağlı)"
        multiline
        value={dedication}
        onChangeText={setDedication}
        maxLength={300}
        placeholder="Canım Elif'ime, nice masallara…"
        hintTr={`${dedication.length}/300 karakter`}
      />

      {/* ── B04 QR ─────────────────────────────────────────── */}
      <Text variant="heading">Sesli QR</Text>
      <Card>
        <ListRow
          titleTr="Her sayfaya QR ekle"
          subtitleTr="QR'ı okutan kişi o sayfayı seçtiğiniz sesle dinler — uygulama kurmadan."
          switchValue={includeQr}
          onSwitchChange={(value) => {
            setIncludeQr(value);
            if (value && qrRenditionId === undefined && usableRenditions[0] !== undefined) {
              setQrRenditionId(usableRenditions[0].id as string);
            }
          }}
          disabled={usableRenditions.length === 0}
          icon="🔊"
        />
        {usableRenditions.length === 0 ? (
          <Text variant="caption" tone="muted">
            QR için önce bir seslendirme gerekir. Hikaye ekranındaki "Sesler"den
            oluşturabilirsiniz.
          </Text>
        ) : includeQr ? (
          <View style={{ gap: 8 }}>
            <Text variant="caption" tone="muted">
              QR hangi sesi çalsın?
            </Text>
            <Row gap="sm" wrap>
              {usableRenditions.map((rendition) => (
                <Chip
                  key={rendition.id as string}
                  label={rendition.voiceLabel}
                  selected={qrRenditionId === (rendition.id as string)}
                  onPress={() => {
                    setQrRenditionId(rendition.id as string);
                  }}
                />
              ))}
            </Row>
          </View>
        ) : null}
      </Card>

      {/* ── İleri ──────────────────────────────────────────── */}
      <Button
        label="Kitabı hazırla ve önizle"
        busy={createBuild.isPending}
        disabled={selectedFormat === undefined || notApproved}
        onPress={() => {
          if (selectedFormat === undefined) return;
          createBuild.mutate(
            {
              storyId: id ?? '',
              formatCode: selectedFormat.code,
              dedicationTr: dedication.trim(),
              includeQr,
              ...(includeQr && qrRenditionId !== undefined ? { qrRenditionId } : {}),
            },
            {
              onSuccess: ({ buildId, jobId }) => {
                router.push({
                  pathname: '/(app)/bastir/[id]/onizleme',
                  params: { id: id ?? '', buildId, jobId },
                });
              },
            },
          );
        }}
      />
      <Text variant="caption" tone="muted">
        Bu adımda ödeme alınmaz; önce gerçek sayfa önizlemesini görürsünüz.
      </Text>

      {createBuild.error !== null ? (
        <NoticeBox tone="danger" titleTr="Kitap hazırlanamadı" bodyTr={createBuild.error.messageTr} />
      ) : null}
    </Screen>
  );
}
