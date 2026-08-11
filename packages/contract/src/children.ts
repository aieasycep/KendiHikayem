/**
 * children.ts — çocuk profilleri.
 *
 * ⚠️ FOTOĞRAF ALANI YOKTUR ve eklenmeyecektir (SPEC §10.1 madde 21).
 * Çocuğun görüntüsü hiçbir katmanda toplanmaz; karakter, Karakter Kurucu
 * formundaki seçeneklerden üretilir. Bu, en büyük KVKK + mağaza politikası
 * riskini sıfırlayan tasarım kararıdır — sözleşmede de görünür olmalıdır.
 */

import {
  ageBandSchema,
  c,
  childIdSchema,
  commonErrorResponses,
  humanNameSchema,
  idempotencyHeadersSchema,
  isoDateSchema,
  okSchema,
  pageQuerySchema,
  paginatedSchema,
  storyCharacterIdSchema,
} from './primitives';
import { z } from 'zod';

export const genderPresentationSchema = z.enum(['kiz', 'erkek', 'belirtilmemis']);
export type GenderPresentation = z.infer<typeof genderPresentationSchema>;

export const childSchema = z.object({
  id: childIdSchema,
  givenName: humanNameSchema,
  nickname: humanNameSchema.optional(),
  ageBand: ageBandSchema,
  /** Yalnızca yıl; tam doğum tarihi istenmez (veri minimizasyonu). */
  birthYear: z.number().int().min(2005).max(2035).optional(),
  genderPresentation: genderPresentationSchema.optional(),
  /** Katalogdaki ilgi alanı kodları — serbest metin değil. */
  interests: z.array(z.string().min(1)).max(8),
  /** "Elif'in kahramanı": sonraki hikayelerde aynı karakter sayfası kullanılır. */
  defaultCharacterId: storyCharacterIdSchema.optional(),
  storyCount: z.number().int().min(0),
  createdAt: isoDateSchema,
});
export type Child = z.infer<typeof childSchema>;

const childWriteSchema = z.object({
  givenName: humanNameSchema,
  nickname: humanNameSchema.optional(),
  ageBand: ageBandSchema,
  birthYear: z.number().int().min(2005).max(2035).optional(),
  genderPresentation: genderPresentationSchema.optional(),
  interests: z.array(z.string().min(1)).max(8).default([]),
});

export const childrenContract = c.router({
  list: {
    method: 'GET',
    path: '/v1/children',
    summary: 'Çocuk profilleri (W01 çocuk seçici)',
    query: pageQuerySchema,
    responses: { 200: paginatedSchema(childSchema), ...commonErrorResponses },
  },

  create: {
    method: 'POST',
    path: '/v1/children',
    summary: 'Çocuk profili ekle (S02)',
    headers: idempotencyHeadersSchema,
    body: childWriteSchema,
    responses: { 201: childSchema, ...commonErrorResponses },
  },

  update: {
    method: 'PATCH',
    path: '/v1/children/:childId',
    summary: 'Çocuk profilini güncelle',
    pathParams: z.object({ childId: childIdSchema }),
    headers: idempotencyHeadersSchema,
    body: childWriteSchema.partial().extend({
      defaultCharacterId: storyCharacterIdSchema.nullable().optional(),
    }),
    responses: { 200: childSchema, ...commonErrorResponses },
  },

  remove: {
    method: 'DELETE',
    path: '/v1/children/:childId',
    summary: 'Çocuk profilini sil — hikayeler silinmez, profil bağı kopar',
    pathParams: z.object({ childId: childIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ keepStories: z.boolean().default(true) }),
    responses: {
      200: okSchema.extend({ sideEffectsTr: z.array(z.string().min(1)) }),
      ...commonErrorResponses,
    },
  },
});
