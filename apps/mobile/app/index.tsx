import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

/**
 * Entry point. Once A1 lands session handling this becomes a real decision
 * (guest session → onboarding, known session → library). For now it always starts at S01.
 */
export default function Index(): ReactNode {
  return <Redirect href="/(onboarding)" />;
}
