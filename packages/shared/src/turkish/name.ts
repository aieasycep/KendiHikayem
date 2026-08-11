/**
 * Given-name validation and normalisation.
 *
 * The hero name flows straight into an LLM prompt and onto a printed book cover, so it is
 * an allowlist, not a denylist (docs/SPEC.md §5.3, §10.4-K1). Anything outside Turkish
 * letters, spaces and hyphens is rejected before it can reach a provider.
 */

import { capitalizeTr } from './alphabet';

export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 30;

/** Turkish letters plus space, hyphen and apostrophe (for names such as "Nur-Ay"). */
const NAME_ALLOWLIST = /^[A-Za-zÇĞİÖŞÜçğıöşü]+(?:[ -][A-Za-zÇĞİÖŞÜçğıöşü]+)*$/u;

export type NameRejectionReason = 'BOS' | 'COK_UZUN' | 'GECERSIZ_KARAKTER';

export interface NameValidation {
  ok: boolean;
  /** Trimmed, whitespace-collapsed, Title-Cased form. Only meaningful when `ok`. */
  normalized: string;
  reason?: NameRejectionReason;
  /** User-facing Turkish message, safe to render directly. */
  messageTr?: string;
}

const MESSAGES_TR: Record<NameRejectionReason, string> = {
  BOS: 'Lütfen bir isim yazın.',
  COK_UZUN: `İsim en fazla ${NAME_MAX_LENGTH} karakter olabilir.`,
  GECERSIZ_KARAKTER: 'İsimde yalnızca harf, boşluk ve tire kullanabilirsiniz.',
};

export function validateGivenName(raw: string): NameValidation {
  const collapsed = raw.trim().replace(/\s+/gu, ' ');

  if (collapsed.length < NAME_MIN_LENGTH) {
    return { ok: false, normalized: '', reason: 'BOS', messageTr: MESSAGES_TR.BOS };
  }
  if (collapsed.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      normalized: '',
      reason: 'COK_UZUN',
      messageTr: MESSAGES_TR.COK_UZUN,
    };
  }
  if (!NAME_ALLOWLIST.test(collapsed)) {
    return {
      ok: false,
      normalized: '',
      reason: 'GECERSIZ_KARAKTER',
      messageTr: MESSAGES_TR.GECERSIZ_KARAKTER,
    };
  }
  return { ok: true, normalized: capitalizeTr(collapsed) };
}

export function isValidGivenName(raw: string): boolean {
  return validateGivenName(raw).ok;
}
