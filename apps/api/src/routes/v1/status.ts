/**
 * routes/v1/status.ts — ⚠️ THE DELIBERATE BREAKAGE MECHANISM (SPEC §3, boundary rule 2).
 *
 * `ENDPOINT_STATUS` is written `satisfies Record<EndpointKey, EndpointStatus>`, and
 * `EndpointKey` is DERIVED from the contract. So:
 *
 *   · a new endpoint added to `packages/contract` without a line here → DOES NOT COMPILE
 *   · a key here that no longer exists in the contract          → DOES NOT COMPILE
 *
 * A new endpoint therefore cannot reach production as a silent 404. It has to be claimed,
 * by name, by whoever owns it — which is the point of the manifest.
 *
 * `owner` is not decoration: it is how the next agent finds their work (docs/SPEC.md §12).
 */

import type { EndpointKey } from '@kendihikayem/contract';

export type EndpointOwner = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';

export interface EndpointStatus {
  /** `true` once a real handler exists. `false` ⇒ the placeholder answers 501. */
  implemented: boolean;
  owner: EndpointOwner;
}

const todo = (owner: EndpointOwner): EndpointStatus => ({ implemented: false, owner });
const done = (owner: EndpointOwner): EndpointStatus => ({ implemented: true, owner });

export const ENDPOINT_STATUS = {
  /* Kimlik — A1 */
  'auth.guest': todo('A1'),
  'auth.otpStart': todo('A1'),
  'auth.otpVerify': todo('A1'),
  'auth.refresh': todo('A1'),
  'auth.logout': todo('A1'),
  'auth.me': todo('A1'),
  'auth.updateMe': todo('A1'),
  'auth.deleteMe': todo('A1'),

  /* Çocuklar — A1 */
  'children.list': todo('A1'),
  'children.create': todo('A1'),
  'children.update': todo('A1'),
  'children.remove': todo('A1'),

  /* Katalog — A1 */
  'catalog.themes': todo('A1'),
  'catalog.artStyles': todo('A1'),
  'catalog.characterOptions': todo('A1'),
  'catalog.systemVoices': todo('A1'),
  'catalog.bookFormats': todo('A1'),
  'catalog.interests': todo('A1'),

  /* Ses — A5 */
  'voice.uploadsPresign': todo('A5'),
  'voice.listProfiles': todo('A5'),
  'voice.getProfile': todo('A5'),
  'voice.createProfile': todo('A5'),
  'voice.script': todo('A5'),
  'voice.submitTake': todo('A5'),
  'voice.submit': todo('A5'),
  'voice.accept': todo('A5'),
  'voice.redo': todo('A5'),
  'voice.remove': todo('A5'),

  /* Hikaye — A3 (metin) / A4 (görsel) */
  'stories.create': todo('A3'),
  'stories.list': todo('A3'),
  'stories.get': todo('A3'),
  'stories.selectCharacterVariant': todo('A4'),
  'stories.approveOutline': todo('A3'),
  'stories.rejectOutline': todo('A3'),
  'stories.updatePage': todo('A3'),
  'stories.rewritePage': todo('A3'),
  'stories.reillustratePage': todo('A4'),
  'stories.revertPage': todo('A3'),
  'stories.approve': todo('A3'),
  'stories.sequel': todo('A3'),
  'stories.favorite': todo('A3'),
  'stories.remove': todo('A3'),

  /* Ses ve okuyucu — A5 */
  'audio.create': todo('A5'),
  'audio.list': todo('A5'),
  'audio.player': todo('A5'),
  'audio.setDefault': todo('A5'),
  'audio.removeRendition': todo('A5'),
  'audio.progress': todo('A5'),
  'audio.readingPreferences': todo('A5'),
  'audio.updateReadingPreferences': todo('A5'),
  'audio.publicPage': todo('A5'),

  /* İşler — A2 (bu ajan) */
  'jobs.get': done('A2'),
  'jobs.list': done('A2'),
  'jobs.cancel': done('A2'),
  'events.jobEvents': done('A2'),
  'events.stream': done('A2'),

  /* Kredi & ödeme — entitlements/estimate A2, ödeme A1 */
  'billing.entitlements': done('A2'),
  'billing.estimate': done('A2'),
  'billing.plans': todo('A1'),
  'billing.subscription': todo('A1'),
  'billing.credits': todo('A1'),
  'billing.checkout': todo('A1'),
  'billing.cancel': todo('A1'),

  /* Baskı & ticaret — A6 */
  'print.createBookBuild': todo('A6'),
  'print.getBookBuild': todo('A6'),
  'print.quote': todo('A6'),
  'print.createOrder': todo('A6'),
  'print.listOrders': todo('A6'),
  'print.getOrder': todo('A6'),
  'print.cancelOrder': todo('A6'),
  'print.createExport': todo('A6'),
  'print.listExports': todo('A6'),

  /* Hukuk & gizlilik — A1 */
  'privacy.legalCurrent': todo('A1'),
  'privacy.consentsGet': todo('A1'),
  'privacy.consentsRecord': todo('A1'),
  'privacy.consentSideEffects': todo('A1'),
  'privacy.consentRevoke': todo('A1'),
  'privacy.privacyRequestCreate': todo('A1'),
  'privacy.privacyRequestList': todo('A1'),
  'privacy.privacyExport': todo('A1'),
  'privacy.dataMap': todo('A1'),
  'privacy.supportReport': todo('A1'),
} satisfies Record<EndpointKey, EndpointStatus>;

export type EndpointStatusMap = typeof ENDPOINT_STATUS;

export const IMPLEMENTED_ENDPOINTS = (Object.keys(ENDPOINT_STATUS) as EndpointKey[]).filter(
  (key) => ENDPOINT_STATUS[key].implemented,
);

export const PENDING_ENDPOINTS = (Object.keys(ENDPOINT_STATUS) as EndpointKey[]).filter(
  (key) => !ENDPOINT_STATUS[key].implemented,
);
