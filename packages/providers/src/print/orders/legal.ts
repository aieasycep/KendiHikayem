/**
 * print/orders/legal.ts — ⭐ 6502 SAYILI KANUN, KODDA ZORLANMIŞ HÂLİ.
 *
 * Turkish consumer law (6502, Mesafeli Sözleşmeler Yönetmeliği m.15/1-b) removes the right
 * of withdrawal for goods produced to the consumer's own specification — a book with a
 * child's name on the cover is the textbook example. BUT the exception only applies if the
 * consumer was INFORMED BEFOREHAND and accepted. "We had a checkbox somewhere" is not a
 * defence; what is a defence is being able to show, years later:
 *
 *     · WHICH text was shown           → `legal_documents.id`
 *     · WHAT that text actually said   → `document_sha256` (hash of the body, copied at the
 *       moment of acceptance — if anyone edits the wording in place afterwards, the FK still
 *       resolves and the hash no longer matches. That mismatch IS the evidence.)
 *     · WHEN it was shown and accepted → `shown_at` < `accepted_at` ≤ order creation
 *     · THAT it was accepted           → `withdrawal_waiver_accepted`
 *
 * `assertWithdrawalEvidence` refuses to let an order be created unless all four hold. It is
 * the server-side twin of the contract's `withdrawalWaiverAccepted: z.literal(true)` and of
 * the `orders_withdrawal_waiver_check` CHECK constraint: three layers, because the cost of
 * getting this wrong is not a bug report, it is a refund order from the ministry.
 *
 * Order documents are kept under `legal_hold_10y` — ten years is the commercial-record
 * retention period, and it OUTLIVES an account deletion (the erasure pipeline must skip
 * them, which is why `orders.user_id` is ON DELETE RESTRICT).
 */

import { createHash } from 'node:crypto';

/** `assets.retention_class` for anything that proves how an order was placed. */
export const ORDER_RETENTION_CLASS = 'legal_hold_10y' as const;
export const ORDER_RETENTION_YEARS = 10;

export interface LegalDocumentRef {
  id: string;
  kind: 'mesafeli_satis' | 'on_bilgilendirme';
  version: string;
  /** The exact markdown that was rendered to the parent. */
  bodyMd: string;
}

export interface WithdrawalEvidenceInput {
  /** `legal_documents.id` of the pre-information / withdrawal notice. */
  withdrawalDocId: string;
  /** `legal_documents.id` of the distance-sales contract. */
  distanceContractDocId: string;
  /** Hash recorded when the text was displayed. */
  documentSha256: string;
  shownAt: Date;
  acceptedAt: Date;
  accepted: boolean;
  orderCreatedAt: Date;
  /** Request context, stored alongside the consent for the audit trail. */
  ip?: string;
  userAgent?: string;
  appVersion?: string;
  deviceId?: string;
}

export interface WithdrawalEvidence extends Omit<WithdrawalEvidenceInput, 'accepted'> {
  accepted: true;
  /** `granted_at + 10 years`; set by the application because the clock is legal, not a default. */
  purgeAfter: Date;
}

export class WithdrawalEvidenceError extends Error {
  constructor(
    readonly code:
      | 'ONAY_YOK'
      | 'METIN_GOSTERILMEDI'
      | 'ZAMAN_SIRASI_HATALI'
      | 'BELGE_DEGISMIS'
      | 'BELGE_EKSIK',
    readonly messageTr: string,
  ) {
    super(`withdrawal evidence rejected: ${code}`);
    this.name = 'WithdrawalEvidenceError';
  }
}

/** sha256 of a legal document body — the anchor the whole proof chain hangs from. */
export function documentSha256(bodyMd: string): string {
  return createHash('sha256').update(bodyMd, 'utf8').digest('hex');
}

/**
 * Validates the evidence and returns the row to store. Throws — never returns a "warning" —
 * because an order that cannot prove its waiver must not exist at all.
 */
export function assertWithdrawalEvidence(
  input: WithdrawalEvidenceInput,
  document?: LegalDocumentRef,
): WithdrawalEvidence {
  if (!input.withdrawalDocId || !input.distanceContractDocId) {
    throw new WithdrawalEvidenceError(
      'BELGE_EKSIK',
      'Ön bilgilendirme ve mesafeli satış sözleşmesi onayı alınmadan sipariş oluşturulamaz.',
    );
  }
  if (!input.accepted) {
    throw new WithdrawalEvidenceError(
      'ONAY_YOK',
      'Siparişi tamamlamak için cayma hakkı bilgilendirmesini onaylamanız gerekiyor.',
    );
  }
  if (input.shownAt.getTime() > input.acceptedAt.getTime()) {
    throw new WithdrawalEvidenceError(
      'ZAMAN_SIRASI_HATALI',
      'Cayma hakkı bilgilendirmesi onaydan sonra gösterilmiş görünüyor; siparişi yeniden başlatın.',
    );
  }
  if (input.acceptedAt.getTime() > input.orderCreatedAt.getTime() + 1000) {
    // Accepted AFTER the order was created ⇒ the notice was not "beforehand".
    throw new WithdrawalEvidenceError(
      'ZAMAN_SIRASI_HATALI',
      'Onay, sipariş oluşturulduktan sonra alınmış görünüyor; siparişi yeniden başlatın.',
    );
  }
  if (document && documentSha256(document.bodyMd) !== input.documentSha256) {
    throw new WithdrawalEvidenceError(
      'BELGE_DEGISMIS',
      'Onayladığınız bilgilendirme metni güncellendi. Lütfen güncel metni okuyup yeniden onaylayın.',
    );
  }

  const purgeAfter = new Date(input.orderCreatedAt);
  purgeAfter.setUTCFullYear(purgeAfter.getUTCFullYear() + ORDER_RETENTION_YEARS);

  return { ...input, accepted: true, purgeAfter };
}

/**
 * The notice itself. The contract requires the FE to print `QuoteRes.withdrawalNoticeTr`
 * verbatim, so the server is the one place it is written — and it names what makes the book
 * personal, because that is the legal basis for the exception.
 */
export function buildWithdrawalNoticeTr(input: { childName?: string }): string {
  const child = input.childName?.trim();
  const who = child ? `${child} için` : 'çocuğunuz için';
  return (
    `Bu kitap yalnızca sizin için üretilmektedir: kapakta ${child ? `${child} adı` : 'çocuğunuzun adı'}, ` +
    `içinde ${who} yazılmış bir hikâye ve onun için çizilmiş resimler bulunur. ` +
    '6502 sayılı Kanun gereği kişiye özel hazırlanan bu üründe CAYMA HAKKINIZ BULUNMAMAKTADIR. ' +
    'Siparişi onaylamadan önce lütfen önizlemeyi inceleyin. ' +
    'Kitap baskıya girmeden önce siparişinizi ücretsiz iptal edebilirsiniz; baskıya girdikten sonra iptal edilemez. ' +
    'Kusurlu veya yanlış basılmış kitabı 30 gün içinde bildirin, ücretsiz yeniliyoruz.'
  );
}

/** Purge date for anything attached to an order (invoice, contract copy, work order). */
export function orderDocumentPurgeAfter(orderCreatedAt: Date): Date {
  const purgeAfter = new Date(orderCreatedAt);
  purgeAfter.setUTCFullYear(purgeAfter.getUTCFullYear() + ORDER_RETENTION_YEARS);
  return purgeAfter;
}

/**
 * Order-scoped records the erasure pipeline must NOT delete on account deletion. A KVKK
 * erasure request removes the child's content; it does not remove the commercial record of
 * a sale, which Turkish tax and consumer law require us to keep.
 */
export const ORDER_RECORDS_EXEMPT_FROM_ERASURE = [
  'orders',
  'payments',
  'invoices',
  'withdrawal_waiver',
  'print_jobs',
] as const;
