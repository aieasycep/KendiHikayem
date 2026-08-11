/**
 * PagesSheet — sayfa listesi alt sayfası.
 *
 * Tasarımın hikaye ekranı sayfa ızgarası göstermez; P02/P03 düzenleme akışına
 * giriş, tasarımdaki "Düzenle" / "Görselleştir" eylem kartlarından açılan bu
 * alt sayfadadır. Bir sayfaya dokunmak `PageEditSheet`i (metin + görsel) açar.
 */

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import type { ImageStatus, Story } from '@kendihikayem/contract';
import { Badge, MediaImage, Row, Sheet, Text, useTheme } from '@kendihikayem/ui';

import type { OfflineStoryMeta } from './offline';

/**
 * Görsel üretiminin AŞAMALI TESLİMİ burada görünür: aynı alt sayfayı açık
 * tutarken sayfalar sırayla "Sırada" → "Çiziliyor" → görsel hâline geçer
 * (istemci üretim sürerken hikayeyi 2.5 sn'de bir yeniler). `manual_review`
 * ise bir kareyi insan kuyruğuna alır ve hikaye buna rağmen tamamlanır.
 */
function imageNoteTr(status: ImageStatus): string | undefined {
  switch (status) {
    case 'ready':
      return undefined;
    case 'generating':
      return 'Çiziliyor…';
    case 'qa_failed':
      return 'Yeniden deneniyor';
    case 'manual_review':
      return 'Kontrolde';
    case 'failed':
      return 'Çizilemedi';
    default:
      return 'Sırada';
  }
}

export interface PagesSheetProps {
  story: Story;
  offlineMeta?: OfflineStoryMeta;
  open: boolean;
  onClose: () => void;
  /** Sayfa seçildi → üst ekran PageEditSheet'i açar. */
  onSelectPage: (pageNo: number) => void;
}

export function PagesSheet({
  story,
  offlineMeta,
  open,
  onClose,
  onSelectPage,
}: PagesSheetProps): ReactElement {
  const { colors, radius } = useTheme();

  return (
    <Sheet open={open} onClose={onClose} titleTr="Sayfalar">
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {story.pages.map((page) => {
            const pageReady = page.textTr !== undefined;
            return (
              <Pressable
                key={page.id as string}
                accessibilityRole="button"
                accessibilityLabel={`${page.pageNo}. sayfa${pageReady ? '' : ' — hazırlanıyor'}`}
                disabled={!pageReady}
                onPress={() => {
                  onSelectPage(page.pageNo);
                }}
                style={({ pressed }) => [
                  styles.rowItem,
                  {
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    opacity: pageReady ? 1 : 0.6,
                  },
                ]}
              >
                <View style={styles.thumb}>
                  <MediaImage
                    uri={page.image?.url}
                    localUri={offlineMeta?.files[`page-${page.pageNo}`]}
                    placeholderLabelTr={`${page.pageNo}`}
                    placeholderNoteTr={imageNoteTr(page.imageStatus)}
                    aspectRatio={1}
                    altTr={`${page.pageNo}. sayfa`}
                  />
                </View>
                <View style={styles.rowBody}>
                  <Row justify="space-between">
                    <Text variant="label">{`Sayfa ${page.pageNo}`}</Text>
                    {page.editedByUser ? <Badge labelTr="Düzenlendi" tone="accent" /> : null}
                  </Row>
                  {pageReady ? (
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {page.textTr}
                    </Text>
                  ) : (
                    <Text variant="caption" tone="muted">
                      Bu sayfa henüz yazılıyor.
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  list: { gap: 10 },
  rowItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  thumb: { width: 64 },
  rowBody: { flex: 1, gap: 4 },
});
