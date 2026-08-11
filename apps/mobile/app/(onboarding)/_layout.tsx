import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { colors } from '../../constants/theme';

export default function OnboardingLayout(): ReactNode {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
