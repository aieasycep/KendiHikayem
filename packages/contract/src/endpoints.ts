/**
 * endpoints.ts — kök sözleşme + TİPLİ ROTA MANİFESTOSU.
 *
 * `endpoints` her ucun yolunu, yöntemini, yetki gereksinimini, idempotency
 * zorunluluğunu, uzun iş/SSE olup olmadığını ve hangi ekranlarda kullanıldığını
 * tek yerde toplar.
 *
 * ⚠️ KASITLI KIRILMA MEKANİZMASI
 * `endpoints` nesnesi `satisfies Record<EndpointKey, EndpointMeta>` ile yazılır ve
 * `EndpointKey` doğrudan `apiContract`'tan TÜRETİLİR. Yani:
 *   · Sözleşmeye yeni bir uç eklenip manifest güncellenmezse → DERLENMEZ.
 *   · Manifestte olmayan bir anahtar yazılırsa → DERLENMEZ.
 *   · `packages/mock` handler haritası `Record<keyof Endpoints, ...>` olduğu için
 *     mock da DERLENMEZ. Yeni uç, mock'suz sisteme sızamaz.
 */

import type { AppRoute, AppRouter } from '@ts-rest/core';

import { audioContract } from './audio';
import { authContract } from './auth';
import { billingContract } from './billing';
import { catalogContract } from './catalog';
import { childrenContract } from './children';
import { eventsContract } from './events';
import { jobsContract } from './jobs';
import { baseHeadersSchema, c } from './primitives';
import { printContract } from './print';
import { privacyContract } from './privacy';
import { storyContract } from './story';
import { voiceContract } from './voice';

/**
 * Kullanıcı uygulamasının gördüğü TÜM sözleşme. `ops` router'ı BİLEREK dışarıdadır
 * (`@kendihikayem/contract/ops`).
 */
export const apiContract = c.router(
  {
    auth: authContract,
    children: childrenContract,
    catalog: catalogContract,
    voice: voiceContract,
    stories: storyContract,
    audio: audioContract,
    jobs: jobsContract,
    events: eventsContract,
    billing: billingContract,
    print: printContract,
    privacy: privacyContract,
  },
  { baseHeaders: baseHeadersSchema },
);

export type ApiContract = typeof apiContract;

/* ── Anahtar türetimi ────────────────────────────────────────── */

type RouteKeysOf<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends AppRoute
    ? `${Prefix}${K}`
    : T[K] extends AppRouter
      ? RouteKeysOf<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

/** 'auth.guest' | 'stories.create' | ... — sözleşmeden türetilir, elle yazılmaz. */
export type EndpointKey = RouteKeysOf<ApiContract>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Yetki gereksinimi. 'optional' = oturumsuz da çalışır ama oturum varsa zenginleşir. */
export type AuthRequirement = 'none' | 'optional' | 'user';

export interface EndpointFlags {
  auth: AuthRequirement;
  /** Kredi/para harcar; istemci öncesinde maliyeti göstermek zorundadır. */
  costly?: boolean;
  /** 202 + JobRef döner; istemci iş takibine geçer. */
  longRunning?: boolean;
  sse?: boolean;
  /** Bu ucu tüketen ekranlar (SPEC §11.1 kodları) — FE ajanları için harita. */
  screens?: readonly string[];
}

export interface EndpointMeta {
  method: HttpMethod;
  path: string;
  /** `Idempotency-Key` başlığı zorunlu mu (tüm yazma uçlarında true). */
  idempotent: boolean;
  auth: AuthRequirement;
  costly: boolean;
  longRunning: boolean;
  sse: boolean;
  screens: readonly string[];
}

const ep = <R extends AppRoute>(route: R, flags: EndpointFlags) => ({
  method: route.method,
  path: route.path,
  idempotent: route.method !== 'GET',
  auth: flags.auth,
  costly: flags.costly ?? false,
  longRunning: flags.longRunning ?? false,
  sse: flags.sse ?? false,
  screens: flags.screens ?? [],
});

/* ── Manifest ────────────────────────────────────────────────── */

export const endpoints = {
  /* Kimlik */
  'auth.guest': ep(apiContract.auth.guest, { auth: 'none', screens: ['S01', 'S02'] }),
  'auth.otpStart': ep(apiContract.auth.otpStart, { auth: 'none', screens: ['S07'] }),
  'auth.otpVerify': ep(apiContract.auth.otpVerify, { auth: 'none', screens: ['S07'] }),
  'auth.refresh': ep(apiContract.auth.refresh, { auth: 'none' }),
  'auth.logout': ep(apiContract.auth.logout, { auth: 'user', screens: ['A01'] }),
  'auth.me': ep(apiContract.auth.me, { auth: 'user', screens: ['A01', 'L01'] }),
  'auth.updateMe': ep(apiContract.auth.updateMe, { auth: 'user', screens: ['A01'] }),
  'auth.deleteMe': ep(apiContract.auth.deleteMe, {
    auth: 'user',
    longRunning: true,
    screens: ['A05'],
  }),

  /* Çocuklar */
  'children.list': ep(apiContract.children.list, { auth: 'user', screens: ['W01', 'L02'] }),
  'children.create': ep(apiContract.children.create, { auth: 'user', screens: ['S02', 'L02'] }),
  'children.update': ep(apiContract.children.update, { auth: 'user', screens: ['L02'] }),
  'children.remove': ep(apiContract.children.remove, { auth: 'user', screens: ['L02'] }),

  /* Katalog */
  'catalog.themes': ep(apiContract.catalog.themes, { auth: 'none', screens: ['S03', 'W02'] }),
  'catalog.artStyles': ep(apiContract.catalog.artStyles, { auth: 'none', screens: ['S05', 'W04'] }),
  'catalog.characterOptions': ep(apiContract.catalog.characterOptions, {
    auth: 'none',
    screens: ['S04', 'W03'],
  }),
  'catalog.systemVoices': ep(apiContract.catalog.systemVoices, {
    auth: 'none',
    screens: ['W06', 'P04'],
  }),
  'catalog.bookFormats': ep(apiContract.catalog.bookFormats, { auth: 'none', screens: ['B01'] }),
  'catalog.interests': ep(apiContract.catalog.interests, { auth: 'none', screens: ['S02', 'L02'] }),

  /* Ses */
  'voice.uploadsPresign': ep(apiContract.voice.uploadsPresign, {
    auth: 'user',
    screens: ['V05', 'V06'],
  }),
  'voice.listProfiles': ep(apiContract.voice.listProfiles, {
    auth: 'user',
    screens: ['A03', 'W06', 'P04'],
  }),
  'voice.getProfile': ep(apiContract.voice.getProfile, { auth: 'user', screens: ['V07'] }),
  'voice.createProfile': ep(apiContract.voice.createProfile, { auth: 'user', screens: ['V03'] }),
  'voice.script': ep(apiContract.voice.script, { auth: 'user', screens: ['V05', 'V06'] }),
  'voice.submitTake': ep(apiContract.voice.submitTake, { auth: 'user', screens: ['V05', 'V06'] }),
  'voice.submit': ep(apiContract.voice.submit, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['V07'],
  }),
  'voice.accept': ep(apiContract.voice.accept, { auth: 'user', screens: ['V08', 'V09'] }),
  'voice.redo': ep(apiContract.voice.redo, { auth: 'user', screens: ['V06', 'V08'] }),
  'voice.remove': ep(apiContract.voice.remove, {
    auth: 'user',
    longRunning: true,
    screens: ['A03'],
  }),

  /* Hikaye */
  'stories.create': ep(apiContract.stories.create, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['S06', 'S08', 'W07'],
  }),
  'stories.list': ep(apiContract.stories.list, { auth: 'user', screens: ['L01', 'L02'] }),
  'stories.get': ep(apiContract.stories.get, { auth: 'user', screens: ['S09', 'S10', 'P01'] }),
  'stories.selectCharacterVariant': ep(apiContract.stories.selectCharacterVariant, {
    auth: 'user',
    screens: ['S09'],
  }),
  'stories.approveOutline': ep(apiContract.stories.approveOutline, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['S09'],
  }),
  'stories.rejectOutline': ep(apiContract.stories.rejectOutline, {
    auth: 'user',
    longRunning: true,
    screens: ['S09'],
  }),
  'stories.updatePage': ep(apiContract.stories.updatePage, { auth: 'user', screens: ['P02'] }),
  'stories.rewritePage': ep(apiContract.stories.rewritePage, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['P02'],
  }),
  'stories.reillustratePage': ep(apiContract.stories.reillustratePage, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['P03'],
  }),
  'stories.revertPage': ep(apiContract.stories.revertPage, { auth: 'user', screens: ['P02'] }),
  'stories.approve': ep(apiContract.stories.approve, { auth: 'user', screens: ['P01', 'B01'] }),
  'stories.sequel': ep(apiContract.stories.sequel, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['L02'],
  }),
  'stories.favorite': ep(apiContract.stories.favorite, { auth: 'user', screens: ['L01'] }),
  'stories.remove': ep(apiContract.stories.remove, { auth: 'user', screens: ['L01'] }),

  /* Ses ve okuyucu */
  'audio.create': ep(apiContract.audio.create, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['P04', 'V09', 'W06'],
  }),
  'audio.list': ep(apiContract.audio.list, { auth: 'user', screens: ['P04'] }),
  'audio.player': ep(apiContract.audio.player, { auth: 'user', screens: ['P01'] }),
  'audio.setDefault': ep(apiContract.audio.setDefault, { auth: 'user', screens: ['P04'] }),
  'audio.removeRendition': ep(apiContract.audio.removeRendition, {
    auth: 'user',
    screens: ['P04'],
  }),
  'audio.progress': ep(apiContract.audio.progress, { auth: 'user', screens: ['P01'] }),
  'audio.readingPreferences': ep(apiContract.audio.readingPreferences, {
    auth: 'user',
    screens: ['A06', 'P01'],
  }),
  'audio.updateReadingPreferences': ep(apiContract.audio.updateReadingPreferences, {
    auth: 'user',
    screens: ['A06'],
  }),
  'audio.publicPage': ep(apiContract.audio.publicPage, { auth: 'none', screens: ['QR'] }),

  /* İşler */
  'jobs.get': ep(apiContract.jobs.get, { auth: 'user', screens: ['S08', 'S10', 'V07'] }),
  'jobs.list': ep(apiContract.jobs.list, { auth: 'user', screens: ['L01'] }),
  'jobs.cancel': ep(apiContract.jobs.cancel, { auth: 'user', screens: ['S10'] }),
  'events.jobEvents': ep(apiContract.events.jobEvents, {
    auth: 'user',
    sse: true,
    screens: ['S08', 'S10', 'V07'],
  }),
  'events.stream': ep(apiContract.events.stream, { auth: 'user', sse: true, screens: ['L01'] }),

  /* Kredi & ödeme */
  'billing.entitlements': ep(apiContract.billing.entitlements, {
    auth: 'user',
    screens: ['S06', 'W07', 'A01'],
  }),
  'billing.estimate': ep(apiContract.billing.estimate, { auth: 'user', screens: ['S06', 'W07'] }),
  'billing.plans': ep(apiContract.billing.plans, { auth: 'user', screens: ['A01'] }),
  'billing.subscription': ep(apiContract.billing.subscription, { auth: 'user', screens: ['A01'] }),
  'billing.credits': ep(apiContract.billing.credits, { auth: 'user', screens: ['A01'] }),
  'billing.checkout': ep(apiContract.billing.checkout, { auth: 'user', screens: ['A01'] }),
  'billing.cancel': ep(apiContract.billing.cancel, { auth: 'user', screens: ['A01'] }),

  /* Baskı & ticaret */
  'print.createBookBuild': ep(apiContract.print.createBookBuild, {
    auth: 'user',
    costly: true,
    longRunning: true,
    screens: ['B01'],
  }),
  'print.getBookBuild': ep(apiContract.print.getBookBuild, { auth: 'user', screens: ['B02'] }),
  'print.quote': ep(apiContract.print.quote, { auth: 'user', screens: ['B05', 'B06'] }),
  'print.createOrder': ep(apiContract.print.createOrder, {
    auth: 'user',
    costly: true,
    screens: ['B06', 'B07'],
  }),
  'print.listOrders': ep(apiContract.print.listOrders, { auth: 'user', screens: ['B08'] }),
  'print.getOrder': ep(apiContract.print.getOrder, { auth: 'user', screens: ['B08'] }),
  'print.cancelOrder': ep(apiContract.print.cancelOrder, { auth: 'user', screens: ['B08'] }),
  'print.createExport': ep(apiContract.print.createExport, {
    auth: 'user',
    longRunning: true,
    screens: ['P05'],
  }),
  'print.listExports': ep(apiContract.print.listExports, { auth: 'user', screens: ['P05'] }),

  /* Hukuk & gizlilik */
  'privacy.legalCurrent': ep(apiContract.privacy.legalCurrent, {
    auth: 'none',
    screens: ['V02', 'V03', 'B06', 'A04'],
  }),
  'privacy.consentsGet': ep(apiContract.privacy.consentsGet, { auth: 'user', screens: ['A02'] }),
  'privacy.consentsRecord': ep(apiContract.privacy.consentsRecord, {
    auth: 'user',
    screens: ['V02', 'V03', 'A02'],
  }),
  'privacy.consentSideEffects': ep(apiContract.privacy.consentSideEffects, {
    auth: 'user',
    screens: ['A02'],
  }),
  'privacy.consentRevoke': ep(apiContract.privacy.consentRevoke, {
    auth: 'user',
    longRunning: true,
    screens: ['A02'],
  }),
  'privacy.privacyRequestCreate': ep(apiContract.privacy.privacyRequestCreate, {
    auth: 'user',
    screens: ['A04'],
  }),
  'privacy.privacyRequestList': ep(apiContract.privacy.privacyRequestList, {
    auth: 'user',
    screens: ['A04'],
  }),
  'privacy.privacyExport': ep(apiContract.privacy.privacyExport, {
    auth: 'user',
    longRunning: true,
    screens: ['A04'],
  }),
  'privacy.dataMap': ep(apiContract.privacy.dataMap, { auth: 'user', screens: ['A04'] }),
  'privacy.supportReport': ep(apiContract.privacy.supportReport, {
    auth: 'optional',
    screens: ['A03', 'P05', 'QR'],
  }),
} satisfies Record<EndpointKey, EndpointMeta>;

export type Endpoints = typeof endpoints;

/** Manifest satırını anahtarla al. */
export function endpointMeta(key: EndpointKey): EndpointMeta {
  return endpoints[key];
}

/** Yazma uçları — `Idempotency-Key` zorunlu olanlar. */
export const WRITE_ENDPOINT_KEYS = (Object.keys(endpoints) as EndpointKey[]).filter(
  (key) => endpoints[key].idempotent,
);

/** Kredi/para harcayan uçlar: istemci öncesinde maliyet göstermelidir. */
export const COSTLY_ENDPOINT_KEYS = (Object.keys(endpoints) as EndpointKey[]).filter(
  (key) => endpoints[key].costly,
);
