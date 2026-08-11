/**
 * print/factory.ts — which printer the process talks to.
 *
 * `PRINT_ADAPTER` picks the implementation and `API_MODE` decides whether an HTTP provider
 * may be reached at all. In `mock` mode an HTTP provider is REFUSED rather than silently
 * downgraded: a test that thinks it is talking to Cloudprinter and is actually talking to a
 * fake is worse than a boot error.
 *
 * Switching printers is meant to be this file plus a dialect — nothing in the worker, the
 * order state machine or the ops panel moves (SPEC §9: "V2'de `cloudprinter` geçişi tek
 * satır config").
 */

import type { PrintAdapter } from '../core/adapters';
import { FakePrintAdapter } from '../core/fakes/adapters';
import { HttpPodPrintAdapter, cloudprinterDialect, type PodDialect } from './http-pod';
import { ManualTrPrintAdapter, type ManualTrOptions } from './manual-tr';

export type PrintAdapterName = 'manual_tr' | 'cloudprinter' | 'gelato' | 'lulu';

export interface PrintFactoryConfig {
  adapter: PrintAdapterName;
  apiMode: 'mock' | 'live';
  /** Required for `manual_tr` (the MVP default). */
  manual?: ManualTrOptions;
  http?: {
    baseUrl: string;
    apiKey?: string;
    skuByFormat: Record<string, string>;
    webhookSecret?: string;
    fetchImpl?: typeof fetch;
    dialect?: PodDialect;
  };
}

export class PrintAdapterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintAdapterConfigError';
  }
}

/**
 * `PRINT_SKU_MAP` is a JSON object mapping our format code to the partner's product id.
 * A malformed value is a configuration error, not a reason to submit an order with no SKU.
 */
export function parsePrintSkuMap(json: string | undefined): Record<string, string> {
  if (!json || json.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PrintAdapterConfigError('PRINT_SKU_MAP geçerli JSON değil');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PrintAdapterConfigError('PRINT_SKU_MAP bir nesne olmalı: {"format":"sku"}');
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
  );
}

export function createPrintAdapter(config: PrintFactoryConfig): PrintAdapter {
  if (config.adapter === 'manual_tr') {
    if (!config.manual) {
      // The fake keeps mock-mode processes booting without an ops store wired up.
      if (config.apiMode === 'mock') return new FakePrintAdapter({ provider: 'fake', model: 'fake-print' });
      throw new PrintAdapterConfigError('manual_tr requires a store and format specs');
    }
    return new ManualTrPrintAdapter(config.manual);
  }

  if (config.apiMode !== 'live') {
    throw new PrintAdapterConfigError(
      `PRINT_ADAPTER=${config.adapter} needs API_MODE=live; use manual_tr in mock mode`,
    );
  }
  if (!config.http?.apiKey) {
    throw new PrintAdapterConfigError(`PRINT_ADAPTER=${config.adapter} requires an API key`);
  }

  // Only the Cloudprinter dialect ships today; Gelato and Lulu differ in field names only,
  // so they arrive as dialects rather than as new adapters.
  const dialect = config.http.dialect ?? cloudprinterDialect;
  return new HttpPodPrintAdapter({
    dialect,
    baseUrl: config.http.baseUrl,
    apiKey: config.http.apiKey,
    skuByFormat: config.http.skuByFormat,
    ...(config.http.webhookSecret ? { webhookSecret: config.http.webhookSecret } : {}),
    ...(config.http.fetchImpl ? { fetchImpl: config.http.fetchImpl } : {}),
  });
}
