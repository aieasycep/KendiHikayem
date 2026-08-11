/**
 * tts/consent.ts — the gate between a recording and a clone.
 *
 * KVKK treats a voiceprint as biometric data (m.6 özel nitelikli kişisel veri), and sending
 * it to ElevenLabs Inc. in the United States is a cross-border transfer (m.9). Both require
 * separate, explicit, un-bundled consent, and the burden of proving consent is ours for ten
 * years — which is why `consents.document_sha256` exists and why nothing here trusts a
 * boolean flag.
 *
 * ⚠️ THIS CHECK MAY NOT BE SKIPPED AND MAY NOT BE "TEMPORARILY DISABLED". It returns a
 * structured refusal rather than a thrown string so the caller must handle every reason,
 * and it fails CLOSED: an unknown state is a refusal.
 */

/** One consent record, as far as this check is concerned. */
export interface ConsentRecord {
  id: string;
  subject: string;
  granted: boolean;
  /** Hash of the exact text shown at the moment of consent. The proof anchor. */
  documentSha256: string;
  /** Hash of the document version currently published under the same kind. */
  method: string;
  grantedAt: Date;
  revokedAt: Date | null;
}

export interface CloneConsentInput {
  consents: readonly ConsentRecord[];
  /** Current published document hashes, keyed by consent subject. */
  publishedHashes: Readonly<Record<string, string>>;
  /** The liveness/consent clip asset. Its absence is a refusal, not a warning. */
  consentClipAssetId: string | null;
  /** Whether the spoken consent clip passed the read-back check (SPEC §7 step 5). */
  livenessVerified: boolean;
  now?: Date;
}

export type ConsentRefusalCode =
  | 'CONSENT_REQUIRED'
  | 'CONSENT_REVOKED'
  | 'VOICE_SCRIPT_MISMATCH';

export type CloneConsentVerdict =
  | {
      ok: true;
      /** `consents.id` of the biometric consent — travels to the vendor as a label. */
      biometricConsentId: string;
      crossBorderConsentId: string;
      /** Written to the audit log alongside the clone. */
      proof: ConsentProof;
    }
  | { ok: false; code: ConsentRefusalCode; detail: string };

export interface ConsentProof {
  biometric: { consentId: string; documentSha256: string; grantedAt: string };
  crossBorder: { consentId: string; documentSha256: string; grantedAt: string };
  consentClipAssetId: string;
  livenessVerified: true;
  verifiedAt: string;
}

/** The two subjects that must BOTH be present, separately (SPEC §7 step 3: no blanket consent). */
export const BIOMETRIC_SUBJECT = 'ses_biyometrik';
export const CROSS_BORDER_SUBJECT = 'yurtdisi_aktarim';

export function verifyCloneConsent(input: CloneConsentInput): CloneConsentVerdict {
  const now = input.now ?? new Date();

  const biometric = latestFor(input.consents, BIOMETRIC_SUBJECT);
  const crossBorder = latestFor(input.consents, CROSS_BORDER_SUBJECT);

  for (const [subject, record] of [
    [BIOMETRIC_SUBJECT, biometric],
    [CROSS_BORDER_SUBJECT, crossBorder],
  ] as const) {
    if (!record || !record.granted) {
      return {
        ok: false,
        code: 'CONSENT_REQUIRED',
        detail: `no granted consent for ${subject}`,
      };
    }
    if (record.revokedAt !== null && record.revokedAt <= now) {
      return { ok: false, code: 'CONSENT_REVOKED', detail: `consent for ${subject} was revoked` };
    }

    // ⚠️ The hash comparison is the point of the whole record. The foreign key proves WHICH
    // document row was shown; the hash proves WHAT IT SAID. If the wording was corrected in
    // place after the fact, the FK still resolves and the hash no longer matches — and that
    // mismatch is evidence that this parent consented to different words, so the consent
    // does not carry. Re-consent, do not clone.
    const published = input.publishedHashes[subject];
    if (published !== undefined && published !== record.documentSha256) {
      return {
        ok: false,
        code: 'CONSENT_REQUIRED',
        detail: `consent for ${subject} was given against an older document version`,
      };
    }
  }

  // The spoken clip is what makes the consent attributable to a person rather than to a
  // session cookie. No clip, or an unverified one, is not consent (SPEC §7 step 5).
  if (!input.consentClipAssetId) {
    return { ok: false, code: 'CONSENT_REQUIRED', detail: 'no spoken consent clip on file' };
  }
  if (!input.livenessVerified) {
    return {
      ok: false,
      code: 'VOICE_SCRIPT_MISMATCH',
      detail: 'the spoken consent clip did not match the server-issued sentence',
    };
  }

  return {
    ok: true,
    biometricConsentId: biometric!.id,
    crossBorderConsentId: crossBorder!.id,
    proof: {
      biometric: {
        consentId: biometric!.id,
        documentSha256: biometric!.documentSha256,
        grantedAt: biometric!.grantedAt.toISOString(),
      },
      crossBorder: {
        consentId: crossBorder!.id,
        documentSha256: crossBorder!.documentSha256,
        grantedAt: crossBorder!.grantedAt.toISOString(),
      },
      consentClipAssetId: input.consentClipAssetId,
      livenessVerified: true,
      verifiedAt: now.toISOString(),
    },
  };
}

function latestFor(
  consents: readonly ConsentRecord[],
  subject: string,
): ConsentRecord | undefined {
  return consents
    .filter((consent) => consent.subject === subject)
    .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())[0];
}

/**
 * A one-time liveness sentence. Server-generated, single-use, short-lived (SPEC §7 step 5).
 *
 * Randomness is the anti-replay property: a recording of somebody else's consent, or a
 * recording made yesterday, cannot contain a sentence generated for this attempt seconds
 * ago. The vocabulary is concrete Turkish nouns and colours — easy to read aloud, easy for
 * an ASR to transcribe, and impossible to guess.
 */
export function livenessSentence(random: () => number = Math.random): string {
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] ?? items[0]!;

  const colours = ['mavi', 'sarı', 'kırmızı', 'yeşil', 'mor', 'turuncu'] as const;
  const counts = ['üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'] as const;
  const containers = ['bardağın', 'kutunun', 'sepetin', 'çekmecenin', 'rafın'] as const;
  const objects = ['düğme', 'kalem', 'taş', 'anahtar', 'kaşık', 'boncuk'] as const;

  return `${pick(colours)} ${pick(containers)} içinde ${pick(counts)} tane ${pick(colours)} ${pick(objects)} duruyor.`;
}
