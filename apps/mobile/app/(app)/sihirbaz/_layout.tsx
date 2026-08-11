import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { colors } from '../../../constants/theme';

/**
 * Registered-user wizard stack (W01–W07). Shares the WizardDraftProvider that
 * lives at the ROOT layout, so a draft survives switching between this tab and
 * the first-run onboarding screens.
 */
export default function SihirbazLayout(): ReactNode {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
