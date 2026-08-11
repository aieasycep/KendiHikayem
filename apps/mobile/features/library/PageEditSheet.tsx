/**
 * PageEditSheet — P02 (metni düzenle) + P03 (görseli yenile) tek alt sayfada.
 *
 * Kurallar:
 *  - Metin düzenlemesi moderasyondan geçer; 422 gelirse `messageTr` aynen
 *    gösterilir ve metin kaybolmaz.
 *  - Metin değişince o hikayenin sesleri sözleşme gereği `stale` olur —
 *    kullanıcıya bunu ÖNCEDEN söylüyoruz.
 *  - Görsel yenileme talimatlıdır ("balonu kırmızı yap") ve uzun iştir: sheet
 *    kapanır, iş hikaye ekranındaki ilerleme kartında izlenir.
 */

import { useEffect, useState, type ReactElement } from 'react';

import type { StoryPage } from '@kendihikayem/contract';
import { Button, Input, NoticeBox, Sheet, Text } from '@kendihikayem/ui';

import { useReillustratePage, useRewritePage, useUpdatePageText } from './hooks';

export interface PageEditSheetProps {
  storyId: string;
  page: StoryPage | undefined;
  open: boolean;
  onClose: () => void;
  /** Uzun iş başladıysa (görsel/yeniden yazım) üst ekran izlesin. */
  onJobStarted: (jobId: string) => void;
}

export function PageEditSheet({
  storyId,
  page,
  open,
  onClose,
  onJobStarted,
}: PageEditSheetProps): ReactElement {
  const [text, setText] = useState('');
  const [instruction, setInstruction] = useState('');

  const updateText = useUpdatePageText();
  const reillustrate = useReillustratePage();
  const rewrite = useRewritePage();

  useEffect(() => {
    if (open) {
      setText(page?.textTr ?? '');
      setInstruction('');
      updateText.reset();
      reillustrate.reset();
      rewrite.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page?.pageNo]);

  const busy = updateText.isPending || reillustrate.isPending || rewrite.isPending;
  const activeError = updateText.error ?? reillustrate.error ?? rewrite.error;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      titleTr={page !== undefined ? `${page.pageNo}. sayfayı düzenle` : 'Sayfayı düzenle'}
    >
      {page === undefined ? (
        <Text variant="body" tone="muted">
          Sayfa bulunamadı.
        </Text>
      ) : (
        <>
          <Input
            label="Sayfa metni"
            multiline
            value={text}
            onChangeText={setText}
            hintTr="Metni değiştirirseniz bu sayfanın seslendirmesi yenilenene kadar eski kalır."
          />
          <Button
            label="Metni kaydet"
            busy={updateText.isPending}
            disabled={busy || text.trim().length === 0 || text === page.textTr}
            onPress={() => {
              updateText.mutate(
                { storyId, pageNo: page.pageNo, textTr: text.trim() },
                { onSuccess: onClose },
              );
            }}
          />

          <Input
            label="Yapay zekaya talimat (isteğe bağlı)"
            value={instruction}
            onChangeText={setInstruction}
            placeholder="Örn: Balonu kırmızı yap, gökyüzü daha yıldızlı olsun"
            hintTr="Talimat hem görsel yenilemede hem yeniden yazımda kullanılır."
          />
          <Button
            label="Görseli yenile"
            variant="secondary"
            busy={reillustrate.isPending}
            disabled={busy}
            onPress={() => {
              reillustrate.mutate(
                {
                  storyId,
                  pageNo: page.pageNo,
                  ...(instruction.trim().length > 0 ? { instructionTr: instruction.trim() } : {}),
                },
                {
                  onSuccess: ({ jobId }) => {
                    onJobStarted(jobId);
                    onClose();
                  },
                },
              );
            }}
          />
          <Button
            label="Bu sayfayı yeniden yazdır"
            variant="ghost"
            busy={rewrite.isPending}
            disabled={busy}
            onPress={() => {
              rewrite.mutate(
                {
                  storyId,
                  pageNo: page.pageNo,
                  ...(instruction.trim().length > 0 ? { instructionTr: instruction.trim() } : {}),
                },
                {
                  onSuccess: ({ jobId }) => {
                    onJobStarted(jobId);
                    onClose();
                  },
                },
              );
            }}
          />

          {activeError !== undefined && activeError !== null ? (
            <NoticeBox tone="danger" titleTr="Kaydedilemedi" bodyTr={activeError.messageTr} />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
