/**
 * auth.ts — misafir oturumu, SMS OTP, oturum birleştirme ve `/me`.
 *
 * ÜRÜN KURALI (SPEC §11.0): DEĞER ÖNCE, HESAP SONRA. Sihirbaz misafir olarak
 * tamamlanır; OTP yalnızca "Hikayemi Oluştur" anında istenir ve misafir oturumu
 * `mergeGuestToken` ile kayıtlı hesaba BİRLEŞTİRİLİR — hiçbir veri kaybolmaz.
 */

import { entitlementsSchema } from './billing';
import {
  c,
  commonErrorResponses,
  idempotencyHeadersSchema,
  jobRefSchema,
  localeSchema,
  phoneSchema,
  timezoneSchema,
  userIdSchema,
} from './primitives';
import { consentStateSchema } from './privacy';
import { z } from 'zod';

/* ── Şemalar ─────────────────────────────────────────────────── */

export const meSchema = z.object({
  id: userIdSchema,
  isGuest: z.boolean(),
  displayName: z.string().optional(),
  /** '+90 5** *** ** 67' — tam numara asla dönmez. */
  phoneMasked: z.string().optional(),
  emailMasked: z.string().optional(),
  locale: localeSchema,
  timezone: timezoneSchema,
  marketingOptIn: z.boolean(),
  entitlements: entitlementsSchema,
  consentState: consentStateSchema,
  /** Sunucu tarafı özellik bayrakları; istemci bilinmeyen anahtarı yok sayar. */
  flags: z.record(z.boolean()),
});
export type Me = z.infer<typeof meSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresInSec: z.number().int().min(1),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const otpChannelSchema = z.enum(['sms', 'email']);
export type OtpChannel = z.infer<typeof otpChannelSchema>;

/** Cihaz kimliği: kurulum başına üretilen opak değer. IMEI/reklam kimliği DEĞİL. */
export const deviceIdSchema = z.string().min(8).max(128);

/* ── Router ──────────────────────────────────────────────────── */

export const authContract = c.router({
  guest: {
    method: 'POST',
    path: '/v1/auth/guest',
    summary: 'Misafir oturumu aç — kayıt olmadan sihirbaza başla (S01)',
    headers: idempotencyHeadersSchema,
    body: z.object({ deviceId: deviceIdSchema }),
    responses: {
      200: z.object({
        accessToken: z.string().min(1),
        expiresInSec: z.number().int().min(1),
        user: meSchema,
      }),
      ...commonErrorResponses,
    },
  },

  otpStart: {
    method: 'POST',
    path: '/v1/auth/otp/start',
    summary: 'Doğrulama kodu gönder (S07) — sıkı rate-limit',
    headers: idempotencyHeadersSchema,
    body: z.object({
      channel: otpChannelSchema,
      /** SMS için +90..., e-posta için adres. */
      destination: z.string().min(3).max(254),
    }),
    responses: {
      200: z.object({
        challengeId: z.string().min(1),
        expiresInSec: z.number().int().min(1),
        /** Bu süre dolmadan "tekrar gönder" butonu pasif kalır. */
        resendAfterSec: z.number().int().min(0),
        /** '+90 5** *** ** 67' — istemci ekranda bunu gösterir. */
        destinationMasked: z.string().min(1),
      }),
      ...commonErrorResponses,
    },
  },

  otpVerify: {
    method: 'POST',
    path: '/v1/auth/otp/verify',
    summary: 'Kodu doğrula ve misafir oturumunu birleştir',
    headers: idempotencyHeadersSchema,
    body: z.object({
      challengeId: z.string().min(1),
      code: z.string().regex(/^\d{6}$/, 'Doğrulama kodu 6 haneli olmalı'),
      deviceId: deviceIdSchema,
      /**
       * Misafirken alınan access token. Verilirse misafir hesabındaki çocuklar,
       * hikayeler ve krediler kayıtlı hesaba taşınır.
       */
      mergeGuestToken: z.string().min(1).optional(),
    }),
    responses: {
      200: authTokensSchema.extend({ user: meSchema, isNewUser: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  refresh: {
    method: 'POST',
    path: '/v1/auth/refresh',
    summary: 'Erişim jetonunu yenile',
    headers: idempotencyHeadersSchema,
    body: z.object({ refreshToken: z.string().min(1) }),
    responses: { 200: authTokensSchema, ...commonErrorResponses },
  },

  logout: {
    method: 'POST',
    path: '/v1/auth/logout',
    summary: 'Oturumu kapat',
    headers: idempotencyHeadersSchema,
    body: z.object({ refreshToken: z.string().min(1).optional() }),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },

  me: {
    method: 'GET',
    path: '/v1/me',
    summary: 'Oturum sahibinin profili, hakları ve rıza durumu',
    responses: { 200: meSchema, ...commonErrorResponses },
  },

  updateMe: {
    method: 'PATCH',
    path: '/v1/me',
    summary: 'Profil güncelle — marketingOptIn değişimi İYS kaydını tetikler',
    headers: idempotencyHeadersSchema,
    body: z.object({
      displayName: z.string().trim().min(1).max(60).optional(),
      marketingOptIn: z.boolean().optional(),
      timezone: timezoneSchema.optional(),
      phone: phoneSchema.optional(),
    }),
    responses: { 200: meSchema, ...commonErrorResponses },
  },

  deleteMe: {
    method: 'DELETE',
    path: '/v1/me',
    summary: 'Hesabı sil (Apple 5.1.1(v)) — uzun iş, silme zinciri çalışır',
    headers: idempotencyHeadersSchema,
    body: z.object({
      /** Kullanıcı 'SIL' yazmadan istek gönderilemez. Yanlış yazım → 422. */
      confirmText: z.literal('SIL'),
      reasonTr: z.string().max(500).optional(),
    }),
    responses: {
      202: z.object({
        job: jobRefSchema,
        /** "Hesabınız ve 7 hikayeniz 30 gün içinde tamamen silinecek." */
        sideEffectsTr: z.array(z.string().min(1)),
      }),
      ...commonErrorResponses,
    },
  },
});
