/**
 * Consent plumbing for V02/V03 (KVKK).
 *
 * Legal design carried into code (SPEC §7 adım 2-3):
 *   · V02 aydınlatma is INFORMATION ONLY — its display is logged with
 *     `method: 'implicit_view'`, which is explicitly NOT consent.
 *   · V03 records each explicit consent as a SEPARATE call with the sha256 of
 *     the exact document text shown — blanket consent is impossible to express.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ApiError, ConsentSubject, LegalDocument, LegalDocumentKind } from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

export function useLegalDocument(kind: LegalDocumentKind): UseQueryResult<LegalDocument, ApiError> {
  return useQuery<LegalDocument, ApiError>({
    queryKey: ['legal', kind],
    queryFn: async () => {
      try {
        const res = await api().privacy.legalCurrent({ params: { kind } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** Throws `ApiError` on failure. One subject per call — the contract enforces it. */
export async function recordConsent(options: {
  subject: ConsentSubject;
  granted: boolean;
  document: LegalDocument;
  method: 'explicit_checkbox' | 'implicit_view';
}): Promise<void> {
  try {
    const res = await api().privacy.consentsRecord({
      body: {
        subject: options.subject,
        granted: options.granted,
        documentId: options.document.id as string,
        documentSha256: options.document.sha256 as string,
        method: options.method,
      },
      headers: { 'idempotency-key': newIdempotencyKey('riza') },
    });
    if (res.status !== 200) throw asApiError(res.body);
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * Ultra-small Markdown renderer input: the contract promises we only need
 * headings, paragraphs and list items. Returns typed blocks for the screen.
 */
export interface LegalBlock {
  kind: 'heading' | 'item' | 'paragraph';
  text: string;
}

export function legalBlocks(bodyMd: string): LegalBlock[] {
  return bodyMd
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): LegalBlock => {
      if (line.startsWith('#')) return { kind: 'heading', text: line.replace(/^#+\s*/, '') };
      if (line.startsWith('- ') || line.startsWith('* '))
        return { kind: 'item', text: line.slice(2).replace(/\*\*/g, '') };
      return { kind: 'paragraph', text: line.replace(/\*\*/g, '') };
    });
}
