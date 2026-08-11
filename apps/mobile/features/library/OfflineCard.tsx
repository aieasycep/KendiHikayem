/**
 * OfflineCard — hikayeyi cihaza indirme kartı (ürünün en büyük farklılaştırıcısı).
 *
 * "İnternet gidince hiçbir şey yüklenmiyordu" — rakip yorumlarının en acı
 * cümlesi. Bu kart, masalın metnini + kelime zamanlamasını + görsellerini +
 * sesini cihaza indirir; uçak modunda P01 tam çalışır.
 *
 * Mock ortamında CDN 404 verdiği için indirme çoğu varlıkta "kısmi" biter; bu
 * durum dürüstçe gösterilir (ör. "3/14 dosya"). Metin ve zamanlama her zaman iner.
 */

import { useState, type ReactElement } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { Story } from '@kendihikayem/contract';
import { Badge, Button, Card, ProgressBar, Row, Text } from '@kendihikayem/ui';

import { api } from '../../lib/api';
import { buildSilentManifest } from '../player/localManifest';
import {
  downloadStoryOffline,
  removeOfflineStory,
  useOfflineIndex,
  type DownloadProgress,
} from './offline';

export function OfflineCard({ story }: { story: Story }): ReactElement {
  const queryClient = useQueryClient();
  const offlineIndex = useOfflineIndex();
  const meta = offlineIndex.data?.[story.id as string];

  const [progress, setProgress] = useState<DownloadProgress | undefined>(undefined);
  const [failedTr, setFailedTr] = useState<string | undefined>(undefined);

  const startDownload = async (): Promise<void> => {
    setFailedTr(undefined);
    setProgress({ done: 0, total: 1, labelTr: 'Masal hazırlanıyor' });
    try {
      let manifest;
      try {
        const res = await api().audio.player({ params: { storyId: story.id as string } });
        manifest = res.status === 200 ? res.body : undefined;
      } catch {
        manifest = undefined;
      }
      manifest ??= buildSilentManifest(story);
      if (manifest === undefined) {
        setFailedTr('Bu hikayenin sayfaları henüz hazır değil; üretim bitince indirebilirsiniz.');
        setProgress(undefined);
        return;
      }
      await downloadStoryOffline(story, manifest, setProgress);
      await queryClient.invalidateQueries({ queryKey: ['offline-index'] });
    } catch {
      setFailedTr('İndirme tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setProgress(undefined);
    }
  };

  const partial = meta !== undefined && meta.assetsCompleted < meta.assetsRequested;

  return (
    <Card>
      <Row justify="space-between">
        <Text variant="heading">Çevrimdışı</Text>
        {meta !== undefined ? (
          <Badge
            labelTr={partial ? 'Kısmen indirildi' : 'İndirildi'}
            tone={partial ? 'warning' : 'success'}
            icon={partial ? '⬇' : '✓'}
          />
        ) : null}
      </Row>

      {progress !== undefined ? (
        <ProgressBar
          value={progress.total > 0 ? progress.done / progress.total : undefined}
          labelTr={progress.labelTr}
          detailTr={`${progress.done} / ${progress.total} dosya`}
        />
      ) : meta !== undefined ? (
        <>
          <Text variant="body" tone="muted">
            {`Metin ve kelime zamanlaması cihazda. ${meta.assetsCompleted} / ${meta.assetsRequested} medya dosyası indirildi.`}
          </Text>
          <Text variant="caption" tone="muted">
            Bu masal uçak modunda bile açılır ve okunur.
          </Text>
          <Row gap="sm">
            <Button
              label="Güncelle"
              variant="secondary"
              compact
              onPress={() => {
                void startDownload();
              }}
            />
            <Button
              label="Cihazdan kaldır"
              variant="danger"
              compact
              onPress={() => {
                void removeOfflineStory(story.id as string).then(() =>
                  queryClient.invalidateQueries({ queryKey: ['offline-index'] }),
                );
              }}
            />
          </Row>
        </>
      ) : (
        <>
          <Text variant="body" tone="muted">
            Masalı cihaza indirin; internet olmadan da açılsın, seslendirmesiyle çalsın.
          </Text>
          <Button
            label="Cihaza indir"
            variant="secondary"
            onPress={() => {
              void startDownload();
            }}
          />
        </>
      )}

      {failedTr !== undefined ? (
        <Text variant="caption" tone="danger">
          {failedTr}
        </Text>
      ) : null}
    </Card>
  );
}
