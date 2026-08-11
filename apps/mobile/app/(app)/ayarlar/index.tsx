import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, View } from 'react-native';

import { Card, ListRow, Row, Screen, Text } from '@kendihikayem/ui';

import { apiModeLabelTr } from '../../../lib/api';
import { GelistiriciSection } from '../../../features/settings/GelistiriciSection';
import { GizlilikSection } from '../../../features/settings/GizlilikSection';
import { HesabiSilSection } from '../../../features/settings/HesabiSilSection';
import { HesapSection } from '../../../features/settings/HesapSection';
import { OkumaSection } from '../../../features/settings/OkumaSection';
import { SesimSection } from '../../../features/settings/SesimSection';
import { VerilerimSection } from '../../../features/settings/VerilerimSection';
import { useMe } from '../../../features/settings/hooks';

type Section =
  | 'root'
  | 'hesap'
  | 'gizlilik'
  | 'sesim'
  | 'verilerim'
  | 'okuma'
  | 'sil'
  | 'gelistirici';

const TITLES: Record<Exclude<Section, 'root'>, string> = {
  hesap: 'Hesap',
  gizlilik: 'Gizlilik ve İzinler',
  sesim: 'Sesim',
  verilerim: 'Verilerim',
  okuma: 'Okuma tercihleri',
  sil: 'Hesabı sil',
  gelistirici: 'Geliştirici',
};

/**
 * A01–A06 Ayarlar. Bölümler tek rota içinde açılır (sekme çubuğu sabit kalır);
 * Android geri tuşu bölümden ana listeye döner.
 *
 * Gizli geliştirici bölümü: sürüm satırına 7 kez dokununca görünür — mock
 * senaryoları oradan değiştirilir.
 */
export default function Ayarlar(): ReactNode {
  const [section, setSection] = useState<Section>('root');
  const [versionTaps, setVersionTaps] = useState(0);
  const devUnlocked = versionTaps >= 7;

  const meQuery = useMe();
  const version = Constants.expoConfig?.version ?? '0.0.0';

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (section !== 'root') {
          setSection('root');
          return true;
        }
        return false;
      });
      return () => {
        subscription.remove();
      };
    }, [section]),
  );

  if (section !== 'root') {
    return (
      <Screen>
        <Row gap="md">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ayarlar listesine dön"
            onPress={() => {
              setSection('root');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text variant="title" tone="muted">
              ‹
            </Text>
          </Pressable>
          <Text variant="title">{TITLES[section]}</Text>
        </Row>
        {section === 'hesap' ? <HesapSection /> : null}
        {section === 'gizlilik' ? <GizlilikSection /> : null}
        {section === 'sesim' ? <SesimSection /> : null}
        {section === 'verilerim' ? <VerilerimSection /> : null}
        {section === 'okuma' ? <OkumaSection /> : null}
        {section === 'sil' ? <HesabiSilSection /> : null}
        {section === 'gelistirici' ? <GelistiriciSection /> : null}
      </Screen>
    );
  }

  const me = meQuery.data;

  return (
    <Screen>
      <Text variant="title">Ayarlar</Text>

      {/* ── Profil özeti ───────────────────────────────────── */}
      <Card
        onPress={() => {
          setSection('hesap');
        }}
        accessibilityLabel="Hesap ayarlarını aç"
      >
        <Row gap="md">
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#F6EDDD',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="heading">👤</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{me?.displayName ?? 'Hesabım'}</Text>
            <Text variant="caption" tone="muted">
              {me?.phoneMasked ?? 'Profil ve kredi bilgileri'}
            </Text>
          </View>
          <Text variant="label" tone="muted">
            ›
          </Text>
        </Row>
      </Card>

      {/* ── Bölümler ───────────────────────────────────────── */}
      <Card flush>
        <ListRow
          icon="🔒"
          titleTr="Gizlilik ve İzinler"
          subtitleTr="Rızalarınız; geri almanın sonuçları önce gösterilir."
          onPress={() => {
            setSection('gizlilik');
          }}
        />
        <ListRow
          icon="🎙"
          titleTr="Sesim"
          subtitleTr="Ses profillerinizi dinleyin, silin, ihbar edin."
          onPress={() => {
            setSection('sesim');
          }}
        />
        <ListRow
          icon="🗂"
          titleTr="Verilerim"
          subtitleTr="Veri haritası, KVKK başvurusu, verilerimi indir."
          onPress={() => {
            setSection('verilerim');
          }}
        />
        <ListRow
          icon="📖"
          titleTr="Okuma tercihleri"
          subtitleTr="Font, punto, kelime vurgusu, uyku modu."
          onPress={() => {
            setSection('okuma');
          }}
        />
      </Card>

      <Card flush>
        <ListRow
          icon="🗑"
          titleTr="Hesabı sil"
          subtitleTr="Tüm verilerinizle birlikte, 30 gün içinde."
          destructive
          onPress={() => {
            setSection('sil');
          }}
        />
      </Card>

      {devUnlocked ? (
        <Card flush>
          <ListRow
            icon="🛠"
            titleTr="Geliştirici"
            subtitleTr="Mock senaryoları, gecikme, iş hızı."
            onPress={() => {
              setSection('gelistirici');
            }}
          />
        </Card>
      ) : null}

      {/* ── Sürüm satırı (7 dokunuş = geliştirici) ─────────── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sürüm ${version}`}
        onPress={() => {
          setVersionTaps((count) => count + 1);
        }}
      >
        <Text variant="caption" tone="muted" center>
          {`KendiHikayem ${version} · ${apiModeLabelTr()}`}
        </Text>
        {versionTaps >= 4 && !devUnlocked ? (
          <Text variant="caption" tone="muted" center>
            {`Geliştirici bölümüne ${7 - versionTaps} dokunuş kaldı`}
          </Text>
        ) : null}
      </Pressable>
    </Screen>
  );
}
