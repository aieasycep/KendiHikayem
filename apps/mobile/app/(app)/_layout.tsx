import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, typography } from '../../constants/theme';

/**
 * Bottom tab shell: Kitaplık · Yeni Hikaye · Ayarlar.
 *
 * Detail routes (hikaye/[id], ses, bastir/[id]) live in the same group but are hidden from
 * the tab bar with `href: null`; they are reached by pushing from a tab.
 *
 * Icons are text for now — packages/ui (F2) owns the real icon set.
 */
function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }): ReactNode {
  return <Text style={[styles.icon, focused && styles.iconFocused]}>{glyph}</Text>;
}

export default function AppLayout(): ReactNode {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="kitaplik/index"
        options={{
          title: 'Kitaplık',
          tabBarIcon: ({ focused }) => <TabIcon glyph="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="sihirbaz"
        options={{
          title: 'Yeni Hikaye',
          tabBarIcon: ({ focused }) => <TabIcon glyph="✨" focused={focused} />,
          // The wizard is a nested stack (W01–W07); popToTop on tab press restarts it.
          popToTopOnBlur: true,
        }}
      />
      <Tabs.Screen
        name="ayarlar/index"
        options={{
          title: 'Ayarlar',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} />,
        }}
      />

      {/* Reachable by navigation, hidden from the tab bar. */}
      <Tabs.Screen name="hikaye/[id]" options={{ href: null }} />
      <Tabs.Screen name="ses" options={{ href: null }} />
      <Tabs.Screen name="bastir/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { ...typography.label, fontSize: 20, opacity: 0.6 },
  iconFocused: { opacity: 1 },
});
