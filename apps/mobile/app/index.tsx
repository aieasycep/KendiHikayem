import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useSession } from '../lib/session';

/**
 * Entry decision (runs after the root layout's bootstrap gate):
 *   verified account → library ("değer önce" already delivered),
 *   guest / fresh install → S01 landing.
 */
export default function Index(): ReactNode {
  const session = useSession();
  if (session.phase === 'user') return <Redirect href="/(app)/kitaplik" />;
  return <Redirect href="/(onboarding)" />;
}
