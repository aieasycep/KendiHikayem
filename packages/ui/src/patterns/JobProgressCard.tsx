/**
 * JobProgressCard — "spinner yok, bildirim var" ilkesinin bileşeni.
 *
 * Uzun işler (iskelet, dolgu, seslendirme, PDF) ekranda dönence ile BEKLENMEZ:
 * bu kart ne olduğunu söyler ("Elif'in odası çiziliyor"), kısmi ilerlemeyi
 * gösterir ve kullanıcıya "kapatabilirsiniz, bitince haber veririz" güvencesini
 * verir. Sözleşmedeki `Job` şekliyle birebir çalışır.
 */

import type { ReactElement } from 'react';

import { Card } from '../primitives/Card';
import { ProgressBar } from '../primitives/ProgressBar';
import { Text } from '../primitives/Text';

export interface JobProgressCardProps {
  /** `job.progress.labelTr` — ekranda birebir gösterilir. */
  labelTr: string;
  /** `job.progress.current` / `total` (yalnızca çubuk için, metin olarak basılmaz). */
  current?: number;
  total?: number;
  /** "9 / 12 sayfa hazır" gibi kısmi teslim satırı. */
  detailTr?: string;
  /** Kullanıcı ekranı kapatabilir mi güvencesi gösterilsin mi. */
  showLeaveHint?: boolean;
}

export function JobProgressCard({
  labelTr,
  current,
  total,
  detailTr,
  showLeaveHint = true,
}: JobProgressCardProps): ReactElement {
  const value =
    current !== undefined && total !== undefined && total > 0
      ? Math.min(1, current / total)
      : undefined;

  return (
    <Card>
      <ProgressBar value={value} labelTr={labelTr} detailTr={detailTr} />
      {showLeaveHint ? (
        <Text variant="caption" tone="muted">
          Beklemek zorunda değilsiniz — hazır olunca bildirim göndereceğiz.
        </Text>
      ) : null}
    </Card>
  );
}
