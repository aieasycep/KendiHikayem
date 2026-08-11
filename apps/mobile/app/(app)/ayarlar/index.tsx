import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card, Row, Screen, Text, palette, useTheme } from '@kendihikayem/ui';

import { apiModeLabelTr } from '../../../lib/api';
import { signOut } from '../../../lib/session';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import { BackCircle } from '../../../features/onboarding/components';
import { GelistiriciSection } from '../../../features/settings/GelistiriciSection';
import { GizlilikSection } from '../../../features/settings/GizlilikSection';
import { HesabiSilSection } from '../../../features/settings/HesabiSilSection';
import { HesapSection } from '../../../features/settings/HesapSection';
import { OkumaSection } from '../../../features/settings/OkumaSection';
import { SesimSection } from '../../../features/settings/SesimSection';
import { VerilerimSection } from '../../../features/settings/VerilerimSection';
import {
  useCredits,
  useMe,
  usePrintOrders,
  useVoiceProfiles,
} from '../../../features/settings/hooks';

type Section = 'root' | 'hesap' | 'gizlilik' | 'okuma' | 'gelistirici';

const TITLES: Record<Exclude<Section, 'root'>, string> = {
  hesap: 'Hesap',
  gizlilik: 'Gizlilik & Ses Verilerim',
  okuma: 'Ayarlar',
  gelistirici: 'Geliştirici',
};

/** Basılı sipariş hâlâ yolda mı? (teslim/iptal/iade değilse aktiftir) */
const ACTIVE_ORDER_STATUSES = new Set([
  'odeme_bekliyor',
  'odendi',
  'uretimde',
  'baskida',
  'kargoya_verildi',
]);

/**
 * Profil & Aile — Figma `Profile` ekranı BİREBİR: degrade başlık, mor kullanıcı
 * kartı (kalem düğmeli), "Çocuklarım" kartları + "+ Çocuk Ekle", tasarımdaki
 * altı menü satırı (Seslerimiz / Siparişlerim / Aboneliğim / Bildirimler /
 * Gizlilik & Ses Verilerim / Ayarlar) ve "Çıkış Yap".
 *
 * Satır içerikleri sözleşme uçlarından gelir; karşılığı olmayan tek satır
 * (Bildirimler) tasarımdaki gibi görünür, dokununca "yakında" der.
 * KVKK bölümleri (rızalar, ses verileri, veri haritası, hesabı sil) menünün
 * arkasındaki bölümlerde eksiksiz durur.
 */
export default function Ayarlar(): ReactNode {
  const router = useRouter();
  const { colors } = useTheme();
  const [section, setSection] = useState<Section>('root');
  const [versionTaps, setVersionTaps] = useState(0);
  const devUnlocked = versionTaps >= 7;

  const meQuery = useMe();
  const creditsQuery = useCredits();
  const childrenQuery = useChildren();
  const voicesQuery = useVoiceProfiles();
  const ordersQuery = usePrintOrders();
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
        {section === 'hesap' ? (
          <>
            <HesapSection />
            <HesabiSilSection />
          </>
        ) : null}
        {section === 'gizlilik' ? (
          <>
            <GizlilikSection />
            <SesimSection />
            <VerilerimSection />
          </>
        ) : null}
        {section === 'okuma' ? <OkumaSection /> : null}
        {section === 'gelistirici' ? <GelistiriciSection /> : null}
      </Screen>
    );
  }

  const me = meQuery.data;
  const childItems = childrenQuery.data ?? [];
  const voiceCount = voicesQuery.data?.items.filter((item) => item.status !== 'revoked').length;
  const orders = ordersQuery.data ?? [];
  const activeOrders = orders.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status));
  const latestOrder = orders[0];
  const balance = creditsQuery.data?.balance;

  const yakinda = (titleTr: string): void => {
    Alert.alert(titleTr, 'Bu bölüm çok yakında burada olacak.');
  };

  return (
    <Screen>
      {/* ── Figma: başlığın arkasındaki lavanta degrade ─────── */}
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['rgba(176,156,224,0.12)', 'rgba(176,156,224,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text variant="title" style={styles.pageTitle} accessibilityRole="header">
          Profil & Aile
        </Text>

        {/* ── Kullanıcı kartı (Figma mor degrade + kalem) ────── */}
        <LinearGradient
          colors={[palette.purple600, palette.nightPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userCard}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarEmoji} accessibilityElementsHidden>
              👤
            </Text>
          </View>
          <View style={styles.userBody}>
            <Text variant="heading" style={styles.userName}>
              {me?.displayName ?? 'Hesabım'}
            </Text>
            <Text variant="caption" style={styles.userMeta}>
              {me?.emailMasked ?? me?.phoneMasked ?? 'Profil bilgileri'}
            </Text>
            {balance !== undefined && (
              <View style={styles.creditPill}>
                <Text style={styles.creditPillIcon} accessibilityElementsHidden>
                  ✨
                </Text>
                <Text style={styles.creditPillText}>{`${String(balance)} kredi`}</Text>
              </View>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profili düzenle"
            hitSlop={8}
            onPress={() => {
              setSection('hesap');
            }}
            style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </LinearGradient>
      </View>

      {/* ── Çocuklarım ─────────────────────────────────────── */}
      {childItems.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Text variant="caption" tone="muted" style={styles.sectionKicker}>
              ÇOCUKLARIM
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Çocuk ekle"
              hitSlop={8}
              onPress={() => {
                router.push('/(app)/sihirbaz');
              }}
            >
              <Text variant="label" style={[styles.addChild, { color: colors.primary }]}>
                + Çocuk Ekle
              </Text>
            </Pressable>
          </View>
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
                    {child.genderPresentation === 'kiz' ? '👧' : '🧒'}
                  </Text>
                </LinearGradient>
                <Text variant="heading" style={styles.childName} numberOfLines={1}>
                  {child.givenName}
                </Text>
                <Text variant="caption" tone="muted" style={styles.childAge}>
                  {`${child.ageBand} yaş`}
                </Text>
                <View style={styles.childStories}>
                  <Text style={styles.childStoriesIcon} accessibilityElementsHidden>
                    📚
                  </Text>
                  <Text style={[styles.childStoriesText, { color: colors.primary }]}>
                    {`${String(child.storyCount)} hikâye`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Hesabım — Figma menü listesi ───────────────────── */}
      <Text variant="caption" tone="muted" style={styles.sectionKicker}>
        HESABIM
      </Text>
      <Card flush>
        <MenuRow
          icon="🎙"
          titleTr="Seslerimiz"
          subTr={
            voiceCount === undefined
              ? 'Ses profilleriniz'
              : voiceCount === 0
                ? 'Sesinizi tanıtın'
                : `${String(voiceCount)} ses kaydedildi`
          }
          onPress={() => {
            router.push('/(app)/ses');
          }}
        />
        <MenuRow
          icon="📦"
          titleTr="Siparişlerim"
          subTr={
            activeOrders.length > 0
              ? `${String(activeOrders.length)} aktif sipariş`
              : orders.length > 0
                ? 'Geçmiş siparişleriniz'
                : 'Henüz sipariş yok'
          }
          badge={activeOrders.length > 0 ? String(activeOrders.length) : undefined}
          onPress={() => {
            if (latestOrder !== undefined) {
              router.push({
                pathname: '/(app)/bastir/[id]/takip',
                params: { id: latestOrder.storyId as string, orderId: latestOrder.id as string },
              });
            } else {
              Alert.alert('Henüz sipariş yok', 'Bir masalı basılı kitaba dönüştürdüğünüzde siparişiniz burada görünür.');
            }
          }}
        />
        <MenuRow
          icon="👑"
          titleTr="Aboneliğim"
          subTr={balance !== undefined ? `${String(balance)} kredi bakiyesi` : 'Kredi ve paketler'}
          onPress={() => {
            setSection('hesap');
          }}
        />
        <MenuRow
          icon="🔔"
          titleTr="Bildirimler"
          subTr="Bildirim tercihleri"
          onPress={() => {
            yakinda('Bildirimler');
          }}
        />
        <MenuRow
          icon="🔒"
          titleTr="Gizlilik & Ses Verilerim"
          subTr="Güvenli ve şifreli"
          onPress={() => {
            setSection('gizlilik');
          }}
        />
        <MenuRow
          icon="⚙️"
          titleTr="Ayarlar"
          subTr="Dil, erişilebilirlik"
          last
          onPress={() => {
            setSection('okuma');
          }}
        />
      </Card>

      {devUnlocked ? (
        <Card flush>
          <MenuRow
            icon="🛠"
            titleTr="Geliştirici"
            subTr="Mock senaryoları, gecikme, iş hızı."
            last
            onPress={() => {
              setSection('gelistirici');
            }}
          />
        </Card>
      ) : null}

      {/* ── Çıkış Yap (Figma) ──────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Çıkış yap"
        onPress={() => {
          Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinize emin misiniz?', [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Çıkış Yap',
              style: 'destructive',
              onPress: () => {
                void signOut().then(() => {
                  router.replace('/');
                });
              },
            },
          ]);
        }}
        style={({ pressed }) => [
          styles.signOut,
          {
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={styles.signOutText}>Çıkış Yap</Text>
      </Pressable>

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

/**
 * Figma menü satırı: 40'lık yumuşak kare ikon kutusu, 15/700 başlık, 12 alt
 * satır, isteğe bağlı mercan rozet ve ince ok.
 */
function MenuRow({
  icon,
  titleTr,
  subTr,
  badge,
  last = false,
  onPress,
}: {
  icon: string;
  titleTr: string;
  subTr: string;
  badge?: string;
  last?: boolean;
  onPress: () => void;
}): ReactNode {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titleTr}. ${subTr}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors.surfaceMuted }]}>
        <Text style={styles.menuIconEmoji} accessibilityElementsHidden>
          {icon}
        </Text>
      </View>
      <View style={styles.menuBody}>
        <Text variant="bodyStrong" style={styles.menuTitle}>
          {titleTr}
        </Text>
        <Text variant="caption" tone="muted" style={styles.menuSub}>
          {subTr}
        </Text>
      </View>
      {badge !== undefined && (
        <View style={[styles.menuBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 18l6-6-6-6"
          stroke={colors.inkMuted}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 20, paddingBottom: 8 },
  /* Figma: Fraunces 30/700. */
  pageTitle: { fontSize: 30, lineHeight: 38 },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: palette.purple600,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  /* Figma: 60'lık avatar, 2 px yarı saydam beyaz kenarlık. */
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarEmoji: { fontSize: 28 },
  userBody: { flex: 1, gap: 2 },
  userName: { color: '#FFFFFF', fontSize: 18, lineHeight: 24 },
  userMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  /* Figma rozet: rgba beyaz .15 zemin · 8 yarıçap · 4/10 dolgu · 11/700 metin. */
  creditPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  creditPillIcon: { fontSize: 12 },
  creditPillText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  /* Figma kalem düğmesi: rgba beyaz .15 · 10 yarıçap · 8/12 dolgu. */
  editButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editButtonPressed: { backgroundColor: 'rgba(255,255,255,0.25)' },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionKicker: { fontSize: 12, letterSpacing: 0.8, fontWeight: '700' },
  addChild: { fontSize: 13, lineHeight: 18, fontWeight: '700' },

  childRow: { flexDirection: 'row', gap: 10 },
  /* Figma çocuk kartı: 16 dolgu · 18 yarıçap · 2 px kenarlık. */
  childCard: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  childAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childEmoji: { fontSize: 26 },
  childName: { fontSize: 16, lineHeight: 21 },
  childAge: { fontSize: 12, lineHeight: 16 },
  childStories: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  childStoriesIcon: { fontSize: 12 },
  childStoriesText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },

  /* Figma menü satırı: 16/18 dolgu, satır arası ince çizgi. */
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconEmoji: { fontSize: 20 },
  menuBody: { flex: 1, gap: 1 },
  menuTitle: { fontSize: 15, lineHeight: 20 },
  menuSub: { fontSize: 12, lineHeight: 16 },
  menuBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBadgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '800' },

  /* Figma Çıkış Yap: beyaz zemin · 1 px kenarlık · 16 yarıçap · #E05454 metin. */
  signOut: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  signOutText: { color: '#E05454', fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
