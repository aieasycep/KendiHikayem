/**
 * routes/v1/estimates.ts — show the price before spending the credit.
 *
 * `POST /v1/estimates` and the worker's cost reservation call THE SAME `estimateCost()`
 * from `packages/providers/core`. That is deliberate: if the preview and the hold were
 * computed by two functions, a parent would eventually be shown one number and charged
 * another, and nobody would notice until a support ticket.
 *
 * The response is `CostPreview` — CREDITS, the thing the parent bought. The USD figure the
 * estimate also produces is internal and stays on this side of the wire.
 */

import type { CostPreview, EstimateOperation } from '@kendihikayem/contract';
import { type PriceBook, estimateCost, toCostPreview } from '@kendihikayem/providers';

/**
 * `params` is free-form in the contract (each operation has different inputs), so it is
 * narrowed here and unknown keys are ignored rather than rejected — a newer client sending
 * a field this server does not know must not break.
 */
export function buildEstimate(
  operation: EstimateOperation,
  params: Record<string, string | number | boolean>,
  priceBook: PriceBook,
): CostPreview {
  const estimate = estimateCost(
    operation,
    {
      ...(typeof params['pageCount'] === 'number' ? { pageCount: params['pageCount'] } : {}),
      ...(typeof params['imageCount'] === 'number' ? { imageCount: params['imageCount'] } : {}),
      ...(typeof params['characters'] === 'number' ? { characters: params['characters'] } : {}),
      ...(params['tier'] === 'draft' || params['tier'] === 'quality'
        ? { tier: params['tier'] }
        : {}),
      ...(typeof params['print'] === 'boolean' ? { print: params['print'] } : {}),
      ...(typeof params['cacheHitRatio'] === 'number'
        ? { cacheHitRatio: params['cacheHitRatio'] }
        : {}),
    },
    priceBook,
  );

  return toCostPreview(estimate);
}

/** Internal USD figure, for the reservation. Never serialised to a client. */
export function estimateUsd(
  operation: EstimateOperation,
  params: Record<string, string | number | boolean>,
  priceBook: PriceBook,
): number {
  return estimateCost(
    operation,
    {
      ...(typeof params['pageCount'] === 'number' ? { pageCount: params['pageCount'] } : {}),
      ...(typeof params['print'] === 'boolean' ? { print: params['print'] } : {}),
    },
    priceBook,
  ).totalUsd;
}
