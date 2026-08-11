import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter, type Href } from 'expo-router';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HomeIcon,
  LibraryIcon,
  PlusIcon,
  ProfileIcon,
  Text,
  palette,
  useTheme,
  type FillableIconProps,
} from '@kendihikayem/ui';

import { useSession } from '../../lib/session';

/**
 * Alt gezinme — Figma `BottomNav.tsx` taşıması.
 *
 * Dört sekme: Ana Sayfa · Hikâyelerim · Oluştur · Profil. "Oluştur" ana
 * eylemdir ve tasarımdaki gibi kalkık mor bir daire olarak öne çıkar; misafir
 * kullanıcıyı onboarding akışına (karsilama), oturumlu kullanıcıyı sihirbaza
 * götürür. Rota adları Türkçe ve mevcut dosya yapısıyla birebirdir; detay
 * rotaları (hikaye/[id], ses, bastir/[id]) sekme çubuğundan gizlidir.
 *
 * Not: "Profil" sekmesi şimdilik mevcut Ayarlar ekranını açar — Figma'daki
 * Profile ekranı sonraki ajan tarafından `ayarlar/` üzerine taşınacak.
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
        else router.push('/(onboarding)/karsilama');
      }}
      style={styles.tabButton}
    >
      <LinearGradient
        colors={[palette.nightPurple, palette.purple600]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.createCircle}
      >
        <PlusIcon size={26} color="#FFFFFF" />
      </LinearGradient>
      <Text variant="caption" style={[styles.tabLabel, styles.createLabel, { color: colors.primary }]}>
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabButton: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 64,
  },
  tabLabel: { fontSize: 10, lineHeight: 14 },
  createLabel: { fontSize: 11, marginTop: 2, fontWeight: '700' },
  createCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: palette.purple600,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
