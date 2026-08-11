import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter, type Href } from 'expo-router';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CirclePlusIcon,
  HomeIcon,
  LibraryIcon,
  ProfileIcon,
  Text,
  palette,
  useTheme,
  type FillableIconProps,
} from '@kendihikayem/ui';

import { useSession } from '../../lib/session';

/**
 * Alt gezinme — Figma `BottomNav.tsx` birebir taşıması.
 *
 * Dört sekme: Ana Sayfa · Hikâyelerim · Oluştur · Profil. "Oluştur" ana
 * eylemdir ve tasarımdaki gibi kalkık mor degrade bir daire içinde daireli artı
 * ikonuyla öne çıkar; misafir kullanıcıyı ilk-masal akışına (kim-icin),
 * oturumlu kullanıcıyı sihirbaza götürür. Rota adları Türkçe ve mevcut dosya
 * yapısıyla birebirdir; detay rotaları (hikaye/[id], ses, bastir/[id]) sekme
 * çubuğundan gizlidir.
 *
 * Not: "Profil" sekmesi Figma'daki Profile ekranının taşındığı Ayarlar
 * ekranını açar.
 */

interface TabItem {
  /** Tabs.Screen rota adı (aktiflik kontrolü için). */
  routeName: string;
  href: Href;
  labelTr: string;
  icon: ComponentType<FillableIconProps>;
}

const LEFT_TABS: TabItem[] = [
  { routeName: 'index', href: '/(app)', labelTr: 'Ana Sayfa', icon: HomeIcon },
  { routeName: 'kitaplik/index', href: '/(app)/kitaplik', labelTr: 'Hikâyelerim', icon: LibraryIcon },
];
const RIGHT_TABS: TabItem[] = [
  { routeName: 'ayarlar/index', href: '/(app)/ayarlar', labelTr: 'Profil', icon: ProfileIcon },
];

function TabButton({ tab, active }: { tab: TabItem; active: boolean }): ReactNode {
  const router = useRouter();
  const { colors } = useTheme();
  const Icon = tab.icon;
  const tint = active ? colors.primary : colors.inkMuted;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.labelTr}
      onPress={() => {
        router.navigate(tab.href);
      }}
      style={styles.tabButton}
    >
      <Icon size={22} color={tint} filled={active} />
      <Text
        variant="caption"
        style={[styles.tabLabel, { color: tint, fontWeight: active ? '700' : '500' }]}
      >
        {tab.labelTr}
      </Text>
    </Pressable>
  );
}

/** Ortadaki kalkık "Oluştur" düğmesi — ekrandaki TEK vurgulu eylem. */
function CreateButton({ active }: { active: boolean }): ReactNode {
  const router = useRouter();
  const session = useSession();
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel="Yeni hikâye oluştur"
      onPress={() => {
        if (session.phase === 'user') router.navigate('/(app)/sihirbaz');
        else router.push('/(onboarding)/kim-icin');
      }}
      style={styles.createButton}
    >
      <LinearGradient
        colors={[palette.nightPurple, palette.purple600]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.createCircle}
      >
        <CirclePlusIcon size={26} color="#FFFFFF" />
      </LinearGradient>
      <Text
        variant="caption"
        style={[
          styles.tabLabel,
          styles.createLabel,
          { color: colors.primary, fontWeight: active ? '700' : '500' },
        ]}
      >
        Oluştur
      </Text>
    </Pressable>
  );
}

function DesignTabBar({ activeRoute }: { activeRoute: string }): ReactNode {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      {LEFT_TABS.map((tab) => (
        <TabButton key={tab.routeName} tab={tab} active={activeRoute === tab.routeName} />
      ))}
      <CreateButton active={activeRoute === 'sihirbaz'} />
      {RIGHT_TABS.map((tab) => (
        <TabButton key={tab.routeName} tab={tab} active={activeRoute === tab.routeName} />
      ))}
    </View>
  );
}

export default function AppLayout(): ReactNode {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={({ state }) => (
        <DesignTabBar activeRoute={state.routes[state.index]?.name ?? ''} />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Ana Sayfa' }} />
      <Tabs.Screen name="kitaplik/index" options={{ title: 'Hikâyelerim' }} />
      <Tabs.Screen
        name="sihirbaz"
        options={{
          title: 'Oluştur',
          // The wizard is a nested stack (W01–W07); popToTop on tab press restarts it.
          popToTopOnBlur: true,
        }}
      />
      <Tabs.Screen name="ayarlar/index" options={{ title: 'Profil' }} />

      {/* Reachable by navigation, hidden from the tab bar. */}
      <Tabs.Screen name="hikaye/[id]" options={{ href: null }} />
      <Tabs.Screen name="ses" options={{ href: null }} />
      <Tabs.Screen name="bastir/[id]" options={{ href: null }} />
    </Tabs>
  );
}

/* Figma BottomNav birebir: beyaz zemin, 1px üst çizgi, paddingTop 8, sekmeler
 * space-around; normal sekme padding 4/12 + ikon 22 + etiket 10; "Oluştur"
 * 52px degrade daire (marginTop -16, gölge 0 4 16 rgba(124,92,191,0.4)) +
 * 11px mor etiket (marginTop 4). */
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabButton: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  createButton: { alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 10, lineHeight: 14, letterSpacing: 0.1 },
  createLabel: { fontSize: 11, marginTop: 4 },
  createCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    shadowColor: palette.purple600,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
