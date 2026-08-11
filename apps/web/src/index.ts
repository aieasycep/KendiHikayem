/**
 * apps/web — Next.js 15 App Router PWA.
 *
 * SCAFFOLD ONLY. Owners: F1 (onboarding/voice/wizard), F2 (player/library/print/settings).
 * Next.js itself is intentionally NOT installed yet: whoever starts this app picks the
 * exact Next version and adds it here.
 *
 * Boundary rule (docs/SPEC.md §3): this app may import ONLY
 * packages/{contract,mock,ui,shared}. Importing packages/db, packages/providers or
 * packages/safety is a lint error, not a convention.
 */
export const APP_NAME = 'kendihikayem-web' as const;
