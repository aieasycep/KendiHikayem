/**
 * providers/print — the print partner and the commercial rules around an order.
 *
 * Owner: A6 (SPEC §12). Three layers, deliberately separate:
 *
 *   · adapters   — `manual_tr` (MVP: work order + ops panel) and `http-pod` (any POD API).
 *   · pricing    — what a book costs, in kuruş, per format and destination.
 *   · orders/    — the rules that are NOT the printer's: when an order may still be
 *                  cancelled (`state.ts`), what makes it legally placeable under 6502
 *                  (`legal.ts`) and how KDV is computed (`invoice.ts`).
 *
 * `orders/` belongs in `packages/services/commerce` per SPEC §12; that package does not
 * exist yet and creating it needs root tsconfig/eslint changes owned by A0, so it lives
 * here — beside the only other code that knows what an order is — until then.
 */
export * from './errors';
export * from './pricing';
export * from './work-order';
export * from './manual-tr';
export * from './http-pod';
export * from './factory';
export * from './orders/state';
export * from './orders/legal';
export * from './orders/invoice';
