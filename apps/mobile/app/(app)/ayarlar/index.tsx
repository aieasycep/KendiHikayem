import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { Card, ListRow, Row, Screen, Text, palette, useTheme } from '@kendihikayem/ui';

import { apiModeLabelTr } from '../../../lib/api';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import { BackCircle } from '../../../features/onboarding/components';
import { GelistiriciSection } from '../../../features/settings/GelistiriciSection';
import { GizlilikSection } from '../../../features/settings/GizlilikSection';
import { HesabiSilSection } from '../../../features/settings/HesabiSilSection';
import { HesapSection } from '../../../features/settings/HesapSection';
import { OkumaSection } from '../../../features/settings/OkumaSection';
import { SesimSection } from '../../../features/settings/SesimSection';
import { VerilerimSection } from '../../../features/settings/VerilerimSection';
import { useCredits, useMe } from '../../../features/settings/hooks';

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
 * A01–A06 Profil & Ayarlar — Figma `Profile` ekranı taşıması: degrade başlık,
 * mor kullanıcı kartı, "Çocuklarım" kartları ve menü listesi. Bölümler tek rota
 * içinde açılır (sekme çubuğu sabit kalır); Android geri tuşu bölümden ana
 * listeye döner.
 *
 * Gizli geliştirici bölümü: sürüm satırına 7 kez dokununca görünür — mock
 * senaryoları oradan değiştirilir.
 */
export default function Ayarlar(): ReactNode {
  const { colors } = useTheme();
  const [section, setSection] = useState<Section>('root');
  const [versionTaps, setVersionTaps] = useState(0);
  const devUnlocked = versionTaps >= 7;

  const meQuery = useMe();
  const creditsQuery = useCredits();
  const childrenQuery = useChildren();
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
          <BackCircle
            onPress={() => {
              setSection('root');
            }}
          />
          <Text variant="title" accessibilityRole="header">
            {TITLES[section]}
          </Text>
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
  const childItems = childrenQuery.data ?? [];

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Profil & Aile
      </Text>

      {/* ── Kullanıcı kartı (Figma mor degrade) ─────────────── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hesap ayarlarını aç"
        onPress={() => {
          setSection('hesap');
        }}
        style={({ pressed }) => [pressed && styles.pressedDim]}
      >
        <LinearGradient
          colors={[palette.purple600, palette.nightPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userCard}
        >
          <View style={styles.userAvatar}>
            <Text variant="heading" accessibilityElementsHidden>
              👤
            </Text>
          </View>
          <View style={styles.userBody}>
            <Text variant="heading" style={styles.userName}>
              {me?.displayName ?? 'Hesabım'}
            </Text>
            <Text variant="caption" style={styles.userMeta}>
              {me?.phoneMasked ?? 'Profil ve kredi bilgileri'}
            </Text>
            {creditsQuery.data !== undefined && (
              <View style={styles.creditPill}>
                <Text variant="caption" style={styles.creditText}>
                  {`✨ ${String(creditsQuery.data.balance)} kredi`}
                </Text>
              </View>
            )}
          </View>
          <Text variant="label" style={styles.userChevron} accessibilityElementsHidden>
            ›
          </Text>
        </LinearGradient>
      </Pressable>

      {/* ── Çocuklarım (fixture verisi — children.list) ─────── */}
      {childItems.length > 0 && (
        <>
          <Text variant="caption" tone="muted" style={styles.sectionKicker}>
            ÇOCUKLARIM
          </Text>
          <View style={styles.childRow}>
            {childItems.map((child) => (
              <View
                key={child.id as string}
                style={[
                  styles.childCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <LinearGradient
                  colors={[palette.lavenderPale, palette.lavenderMist]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.childAvatar}
                >
                  <Text style={styles.childEmoji} accessibilityElementsHidden>
                    {child.genderPresentation === 'erkek' ? '👦' : '👧'}
                  </Text>
                </LinearGradient>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {child.givenName}
                </Text>
                <Text variant="caption" tone="muted">
                  {`${child.ageBand} yaş`}
                </Text>
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                  {`📚 ${String(child.storyCount)} hikaye`}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Bölümler ───────────────────────────────────────── */}
      <Text variant="caption" tone="muted" style={styles.sectionKicker}>
        HESABIM
      </Text>
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

const styles = StyleSheet.create({
  pressedDim: { opacity: 0.9 },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: palette.purple600,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userBody: { flex: 1, gap: 3 },
  userName: { color: '#FFFFFF' },
  userMeta: { color: 'rgba(255,255,255,0.78)' },
  creditPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 3,
  },
  creditText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, lineHeight: 16 },
  userChevron: { color: 'rgba(255,255,255,0.8)' },

  sectionKicker: { fontSize: 12, letterSpacing: 0.8, fontWeight: '700' },

  childRow: { flexDirection: 'row', gap: 10 },
  childCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  childAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childEmoji: { fontSize: 26 },
});
