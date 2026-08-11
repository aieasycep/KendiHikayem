import { Stack, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { colors } from '../../../constants/theme';
import { VoiceFlowProvider } from '../../../features/voice/flow';

/**
 * Voice onboarding stack (V01–V09). The flow provider lives here so profileId,
 * the one-time script and per-passage results survive navigation between steps.
 *
 * The tab bar is hidden for the whole flow. Two reasons: the later steps render
 * on the night gradient and a daytime tab bar underneath them looks like a bug,
 * and recording is a focused, consent-gated sequence — letting someone hop to
 * another tab mid-passage would strand a half-recorded voice profile. Every step
 * carries its own back affordance, so nothing becomes unreachable.
 */
export default function SesLayout(): ReactNode {
  const navigation = useNavigation();

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      parent?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

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
