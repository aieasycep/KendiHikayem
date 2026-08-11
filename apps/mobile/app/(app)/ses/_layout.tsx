import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { colors } from '../../../constants/theme';
import { VoiceFlowProvider } from '../../../features/voice/flow';

/**
 * Voice onboarding stack (V01–V09). The flow provider lives here so profileId,
 * the one-time script and per-passage results survive navigation between steps.
 */
export default function SesLayout(): ReactNode {
  return (
    <VoiceFlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </VoiceFlowProvider>
  );
}
