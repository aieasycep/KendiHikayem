/**
 * A06 Okuma tercihleri — font (disleksi dostu seçenek dahil), punto, kelime
 * vurgusu varsayılanı, otomatik sayfa çevirme ve uyku modu.
 *
 * Tercihler sunucuda tutulur (cihazlar arası taşınır) ve oynatıcı manifest'in
 * tipografisini bu tercihle ezerek kullanır.
 */

import { type ReactElement } from 'react';
import { View } from 'react-native';

import type { ReaderFont } from '@kendihikayem/contract';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  ListRow,
  Row,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useReadingPreferences, useUpdateReadingPreferences } from '../player/hooks';

const FONTS: Array<{ code: ReaderFont; labelTr: string; hintTr?: string }> = [
  { code: 'Andika', labelTr: 'Andika' },
  { code: 'Nunito', labelTr: 'Nunito' },
  { code: 'Lexend', labelTr: 'Lexend' },
  { code: 'OpenDyslexic', labelTr: 'OpenDyslexic', hintTr: 'Disleksi dostu' },
];

export function OkumaSection(): ReactElement {
  const prefsQuery = useReadingPreferences();
  const update = useUpdateReadingPreferences();
  const prefs = prefsQuery.data;

  if (prefsQuery.isLoading) {
    return (
      <View style={{ gap: 12 }}>
        <Skeleton height={140} rounded />
        <Skeleton height={140} rounded />
      </View>
    );
  }

  if (prefs === undefined) {
    return (
      <ErrorState
        messageTr={prefsQuery.error?.messageTr}
        onRetry={() => {
          void prefsQuery.refetch();
        }}
      />
    );
  }

  const sizePt = prefs.typography.sizePt;

  return (
    <View style={{ gap: 12 }}>
      {/* ── Yazı tipi ──────────────────────────────────────── */}
      <Card>
        <Text variant="bodyStrong">Yazı tipi</Text>
        <Row gap="sm" wrap>
          {FONTS.map((font) => (
            <Chip
              key={font.code}
              label={font.hintTr !== undefined ? `${font.labelTr} · ${font.hintTr}` : font.labelTr}
              selected={prefs.typography.fontFamily === font.code}
              onPress={() => {
                update.mutate({ typography: { ...prefs.typography, fontFamily: font.code } });
              }}
            />
          ))}
        </Row>
      </Card>

      {/* ── Punto ──────────────────────────────────────────── */}
      <Card>
        <Row justify="space-between">
          <Text variant="bodyStrong">Yazı boyutu</Text>
          <Text variant="bodyStrong" tone="accent">{`${sizePt} pt`}</Text>
        </Row>
        <Row gap="sm">
          <View style={{ flex: 1 }}>
            <Button
              label="Küçült"
              variant="secondary"
              compact
              disabled={sizePt <= 18}
              onPress={() => {
                update.mutate({
                  typography: { ...prefs.typography, sizePt: Math.max(18, sizePt - 2) },
                });
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Büyüt"
              variant="secondary"
              compact
              disabled={sizePt >= 30}
              onPress={() => {
                update.mutate({
                  typography: { ...prefs.typography, sizePt: Math.min(30, sizePt + 2) },
                });
              }}
            />
          </View>
        </Row>
        <Text style={{ fontSize: sizePt, lineHeight: Math.round(sizePt * prefs.typography.lineHeight) }}>
          Elif, tavan arasındaki ışığı takip etti.
        </Text>
        <Text variant="caption" tone="muted">
          Gövde metni erişilebilirlik gereği 18 punto altına inmez.
        </Text>
      </Card>

      {/* ── Davranışlar ────────────────────────────────────── */}
      <Card>
        <ListRow
          titleTr="Kelime vurgusu"
          subtitleTr="Okunan kelime renklenir. 0-2 ve 3-5 yaş için kapalı başlatılır."
          switchValue={prefs.wordHighlight}
          onSwitchChange={(value) => {
            update.mutate({ wordHighlight: value });
          }}
          icon="✨"
        />
        <ListRow
          titleTr="Otomatik sayfa çevirme"
          subtitleTr="Kapalıysa her sayfanın sonunda durur."
          switchValue={prefs.autoPageTurn}
          onSwitchChange={(value) => {
            update.mutate({ autoPageTurn: value });
          }}
          icon="📄"
        />
      </Card>

      {/* ── Uyku modu ──────────────────────────────────────── */}
      <Card>
        <ListRow
          titleTr="Uyku modu"
          subtitleTr="Son sayfalara doğru ekran kararır, ses ve tempo yumuşar, bitince durur."
          switchValue={prefs.bedtimeMode.enabled}
          onSwitchChange={(value) => {
            update.mutate({ bedtimeMode: { ...prefs.bedtimeMode, enabled: value } });
          }}
          icon="🌙"
        />
        {prefs.bedtimeMode.enabled ? (
          <>
            <Row justify="space-between">
              <Text variant="body">Kararma başlangıcı</Text>
              <Text variant="body" tone="accent">{`${prefs.bedtimeMode.fadeStartsAtPage}. sayfa`}</Text>
            </Row>
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <Button
                  label="Daha erken"
                  variant="secondary"
                  compact
                  disabled={prefs.bedtimeMode.fadeStartsAtPage <= 4}
                  onPress={() => {
                    update.mutate({
                      bedtimeMode: {
                        ...prefs.bedtimeMode,
                        fadeStartsAtPage: Math.max(4, prefs.bedtimeMode.fadeStartsAtPage - 1),
                      },
                    });
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Daha geç"
                  variant="secondary"
                  compact
                  disabled={prefs.bedtimeMode.fadeStartsAtPage >= 15}
                  onPress={() => {
                    update.mutate({
                      bedtimeMode: {
                        ...prefs.bedtimeMode,
                        fadeStartsAtPage: Math.min(15, prefs.bedtimeMode.fadeStartsAtPage + 1),
                      },
                    });
                  }}
                />
              </View>
            </Row>
            <Text variant="body">Bitişteki ses seviyesi</Text>
            <Row gap="sm" wrap>
              {[0.2, 0.35, 0.5].map((volume) => (
                <Chip
                  key={volume}
                  label={`%${Math.round(volume * 100)}`}
                  selected={Math.abs(prefs.bedtimeMode.targetEndVolume - volume) < 0.01}
                  onPress={() => {
                    update.mutate({
                      bedtimeMode: { ...prefs.bedtimeMode, targetEndVolume: volume },
                    });
                  }}
                />
              ))}
            </Row>
          </>
        ) : null}
      </Card>

      {update.error !== null ? (
        <Text variant="caption" tone="danger">
          {update.error.messageTr}
        </Text>
      ) : null}
    </View>
  );
}
