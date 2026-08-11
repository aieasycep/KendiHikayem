/**
 * payment/factory.ts — which payment provider the process talks to.
 *
 * There is no fake: a payment adapter that pretends to charge is a liability. In mock mode
 * the API serves the mock server's checkout URL instead, and this factory refuses to build
 * anything (SPEC §3: the mock lives in packages/mock, not inside a provider).
 */

import { IyzicoPaymentAdapter } from './iyzico';
import type { PaymentAdapter, PaymentProvider } from './types';

export interface PaymentFactoryConfig {
  provider: PaymentProvider;
  apiMode: 'mock' | 'live';
  apiKey?: string;
  secretKey?: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigError';
  }
}

export function createPaymentAdapter(config: PaymentFactoryConfig): PaymentAdapter {
  if (config.apiMode !== 'live') {
    throw new PaymentConfigError(
      'ödeme adaptörü yalnızca API_MODE=live ile kurulur; mock modda packages/mock kullanılır',
    );
  }
  if (config.provider !== 'iyzico') {
    throw new PaymentConfigError(`unsupported payment provider: ${config.provider}`);
  }
  if (!config.apiKey || !config.secretKey) {
    throw new PaymentConfigError('IYZICO_API_KEY ve IYZICO_SECRET_KEY zorunlu');
  }
  return new IyzicoPaymentAdapter({
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  });
}
