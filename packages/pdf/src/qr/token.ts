/**
 * qr/token.ts — ⭐ the link that is printed on paper.
 *
 * A QR code in a printed book cannot be rotated, cannot be un-published and cannot be
 * password-protected: whoever holds the book can scan it, and the book may be a gift, may
 * be resold, may be photographed and posted. The token therefore has to be
 *
 *   · unguessable  — 80 bits of randomness, so scanning the ID space is pointless;
 *   · sessionless  — `/p/:token` must work for a grandparent who has no account;
 *   · revocable    — `page_audio_links.revoked_at` kills one book's links instantly;
 *   · expiring     — the DB has no `expires_at` column (schema is frozen), so the lifetime
 *                    is a POLICY over `created_at`: `evaluateQrToken` is the single place
 *                    that decides, and both the API route and the ops panel call it.
 *
 * The alphabet is Crockford base32 without I/L/O/U: it survives being read aloud over the
 * phone to support, and it cannot accidentally spell a Turkish word.
 */

import { randomBytes } from 'node:crypto';

/** Crockford base32, minus the vowel U so no word can form. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 16 chars × 5 bits = 80 bits. */
export const QR_TOKEN_LENGTH = 16;

/** Default lifetime of a printed page link. Config: `QR_TOKEN_TTL_DAYS`. */
export const DEFAULT_QR_TTL_DAYS = 3650;

export type RandomSource = (byteCount: number) => Uint8Array;

const defaultRandom: RandomSource = (byteCount) => new Uint8Array(randomBytes(byteCount));

/** Mints one `page_audio_links.token`. */
export function mintQrToken(random: RandomSource = defaultRandom): string {
  const bytes = random(QR_TOKEN_LENGTH);
  let token = '';
  for (let i = 0; i < QR_TOKEN_LENGTH; i += 1) {
    token += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  }
  return token;
}

export function isQrToken(value: string): boolean {
  if (value.length !== QR_TOKEN_LENGTH) return false;
  return [...value].every((character) => ALPHABET.includes(character));
}

/**
 * The URL printed under the code. Short on purpose: every character is a QR module, and
 * a shorter URL means a bigger, more scannable module at the same physical size.
 */
export function pageAudioUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/p/${token}`;
}

export type QrTokenState = 'active' | 'revoked' | 'expired' | 'unknown';

export interface QrTokenRecord {
  token: string;
  createdAt: Date;
  revokedAt?: Date | null;
}

export interface QrTokenVerdict {
  state: QrTokenState;
  /** Shown on `/p/:token` — the reader is often not our user, so it must be plain Turkish. */
  messageTr?: string;
  expiresAt?: Date;
}

/**
 * Decides whether a scanned token may play. Pure, so both the API and the tests agree.
 *
 * Revocation beats expiry: if a parent revoked the book (lost, gifted on, printed by
 * mistake) we say so explicitly rather than blaming the clock.
 */
export function evaluateQrToken(
  record: QrTokenRecord | undefined,
  options: { ttlDays?: number; now?: Date } = {},
): QrTokenVerdict {
  if (!record) {
    return {
      state: 'unknown',
      messageTr:
        'Bu karekod tanınmadı. Kitabınızdaki kodu yeniden okutmayı deneyin; sorun sürerse bize yazın.',
    };
  }

  const now = options.now ?? new Date();
  if (record.revokedAt) {
    return {
      state: 'revoked',
      messageTr:
        'Bu karekodun bağlantısı kapatılmış. Kitabın sahibi dinleme bağlantısını iptal etmiş olabilir.',
    };
  }

  const ttlDays = options.ttlDays ?? DEFAULT_QR_TTL_DAYS;
  const expiresAt = new Date(record.createdAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  if (now.getTime() > expiresAt.getTime()) {
    return {
      state: 'expired',
      expiresAt,
      messageTr:
        'Bu karekodun dinleme süresi doldu. Hesabınızdan kitabı açıp bağlantıyı yenileyebilirsiniz.',
    };
  }

  return { state: 'active', expiresAt };
}
