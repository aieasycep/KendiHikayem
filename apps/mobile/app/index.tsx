import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useSession } from '../lib/session';

/**
 * Entry decision (runs after the root layout's bootstrap gate):
 *   verified account → library ("değer önce" already delivered),
 *   guest / fresh install → S01 landing.
 *
 * The landing screen is `(onboarding)/karsilama`, deliberately NOT
 * `(onboarding)/index`. A route group contributes no path segment, so an
 * `index` inside it resolves to "/" — the exact same path as this file. Two
 * files claiming "/" is an ambiguous route, and the redirect below then pointed
 * back at itself: the app rendered nothing and opened as a blank screen.
 */
export default function Index(): ReactNode {
  const session = useSession();
  if (session.phase === 'user') return <Redirect href="/(app)/kitaplik" />;
  return <Redirect href="/(onboarding)/karsilama" />;
}
