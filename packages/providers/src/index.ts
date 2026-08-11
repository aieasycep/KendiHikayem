/**
 * @kendihikayem/providers — AI provider adapters behind a router.
 *
 * The public surface is `core/`: adapter interfaces, `ProviderRouter`, `CircuitBreaker`,
 * `CostLedger`, `ProviderError`, the price book and the deterministic fakes.
 * Owner: A2 for `core/`; A3–A6 for the vendor implementations (see docs/SPEC.md §12).
 */
export const PACKAGE_NAME = '@kendihikayem/providers' as const;

export * from './core/index';
export * from './image/index';
export * from './llm/index';
export * from './moderation/index';
export * from './print/index';
export * from './payment/index';
export * from './tts/index';
