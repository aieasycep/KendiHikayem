/**
 * features/settings/hooks.ts — A01–A06 veri kancaları (F2).
 *
 * Gizlilik akışının sözleşme disiplini:
 *  - Rıza geri almadan ÖNCE `GET /v1/consents/:subject/side-effects` çekilir ve
 *    `sideEffectsTr` kullanıcıya AYNEN gösterilir (A02).
 *  - `DELETE /v1/consents/:subject` ancak `sideEffectsAcknowledged: true` ile
 *    çağrılabilir — sözleşme literal tipi bunu derleme düzeyinde zorlar.
 *  - Hesap silme `confirmText: 'SIL'` literal'ı ister; yanlış yazım 422.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ApiError,
  ConsentSideEffects,
  ConsentState,
  ConsentStateSubject,
  CreditEntry,
  DataMapCategory,
  Me,
  Order,
  PrivacyRequest,
  PrivacyRequestKind,
  ReportReason,
  SystemVoice,
  VoiceProfile,
} from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

/* ── Hesap (A01) ─────────────────────────────────────────────── */

export function useMe() {
  return useQuery<Me, ApiError>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await api().auth.me();
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation<Me, ApiError, { displayName?: string; marketingOptIn?: boolean }>({
    mutationFn: async (patch) => {
      try {
        const res = await api().auth.updateMe({
          headers: { 'idempotency-key': newIdempotencyKey('profil') },
          body: patch,
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me);
    },
  });
}

export function useCredits() {
  return useQuery<{ balance: number; entries: CreditEntry[] }, ApiError>({
    queryKey: ['credits'],
    queryFn: async () => {
      try {
        const res = await api().billing.credits({ query: {} });
        if (res.status !== 200) throw asApiError(res.body);
        return { balance: res.body.balance, entries: res.body.entries };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/* ── Siparişlerim (B08 / Profil menüsü) ──────────────────────── */

export function usePrintOrders(enabled = true) {
  return useQuery<Order[], ApiError>({
    queryKey: ['print-orders'],
    enabled,
    queryFn: async () => {
      try {
        const res = await api().print.listOrders({ query: {} });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/* ── Gizlilik ve izinler (A02) ───────────────────────────────── */

export function useConsents() {
  return useQuery<ConsentState, ApiError>({
    queryKey: ['consents'],
    queryFn: async () => {
      try {
        const res = await api().privacy.consentsGet();
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/** Geri almadan ÖNCE sonuçları Türkçe göster — Apple 5.1.1(ii) + KVKK pratiği. */
export function useConsentSideEffects(subject: ConsentStateSubject | undefined) {
  return useQuery<ConsentSideEffects, ApiError>({
    queryKey: ['consent-side-effects', subject],
    enabled: subject !== undefined,
    queryFn: async () => {
      try {
        const res = await api().privacy.consentSideEffects({
          params: { subject: subject ?? 'pazarlama' },
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useRevokeConsent() {
  const queryClient = useQueryClient();
  return useMutation<
    { sideEffectsTr: string[]; jobId?: string },
    ApiError,
    { subject: ConsentStateSubject }
  >({
    mutationFn: async ({ subject }) => {
      try {
        const res = await api().privacy.consentRevoke({
          params: { subject },
          headers: { 'idempotency-key': newIdempotencyKey('rizageri') },
          body: { sideEffectsAcknowledged: true },
        });
        if (res.status !== 200) throw asApiError(res.body);
        return {
          sideEffectsTr: res.body.sideEffectsTr,
          ...(res.body.jobId !== undefined ? { jobId: res.body.jobId as string } : {}),
        };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['consents'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
    },
  });
}

/** Pazarlama izni gibi uygulama içinde verilebilen rızalar (ses rızası F1 akışındadır). */
export function useGrantConsent() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { subject: 'pazarlama'; granted: boolean }>({
    mutationFn: async ({ subject, granted }) => {
      try {
        const doc = await api().privacy.legalCurrent({
          params: { kind: 'acik_riza_pazarlama' },
        });
        if (doc.status !== 200) throw asApiError(doc.body);
        const res = await api().privacy.consentsRecord({
          headers: { 'idempotency-key': newIdempotencyKey('riza') },
          body: {
            subject,
            granted,
            documentId: doc.body.id as string,
            documentSha256: doc.body.sha256,
            method: 'explicit_checkbox',
          },
        });
        if (res.status !== 200) throw asApiError(res.body);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['consents'] });
    },
  });
}

/* ── Sesim (A03) ─────────────────────────────────────────────── */

export function useVoiceProfiles() {
  return useQuery<{ items: VoiceProfile[]; limit: number }, ApiError>({
    queryKey: ['voice-profiles'],
    queryFn: async () => {
      try {
        const res = await api().voice.listProfiles();
        if (res.status !== 200) throw asApiError(res.body);
        return { items: res.body.items, limit: res.body.limit };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useDeleteVoiceProfile() {
  const queryClient = useQueryClient();
  return useMutation<{ sideEffectsTr: string[] }, ApiError, { voiceProfileId: string }>({
    mutationFn: async ({ voiceProfileId }) => {
      try {
        const res = await api().voice.remove({
          params: { voiceProfileId },
          headers: { 'idempotency-key': newIdempotencyKey('sesprofilsil') },
          body: { sideEffectsAcknowledged: true },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { sideEffectsTr: res.body.sideEffectsTr };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['audio-list'] });
    },
  });
}

export function useSystemVoices() {
  return useQuery<SystemVoice[], ApiError>({
    queryKey: ['system-voices'],
    queryFn: async () => {
      try {
        const res = await api().catalog.systemVoices();
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
    staleTime: 10 * 60_000,
  });
}

/* ── İhbar ───────────────────────────────────────────────────── */

export function useSupportReport() {
  return useMutation<
    { reportId: string; messageTr: string },
    ApiError,
    {
      targetType: 'story' | 'page' | 'voice_profile' | 'user' | 'diger';
      targetId?: string;
      reason: ReportReason;
      detailTr: string;
    }
  >({
    mutationFn: async (body) => {
      try {
        const res = await api().privacy.supportReport({
          headers: { 'idempotency-key': newIdempotencyKey('ihbar') },
          body,
        });
        if (res.status !== 201) throw asApiError(res.body);
        return { reportId: res.body.reportId as string, messageTr: res.body.messageTr };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/* ── Verilerim (A04) ─────────────────────────────────────────── */

export function useDataMap() {
  return useQuery<DataMapCategory[], ApiError>({
    queryKey: ['data-map'],
    queryFn: async () => {
      try {
        const res = await api().privacy.dataMap();
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.categories;
      } catch (error) {
        throw toApiError(error);
      }
    },
    staleTime: 10 * 60_000,
  });
}

export function usePrivacyRequests() {
  return useQuery<PrivacyRequest[], ApiError>({
    queryKey: ['privacy-requests'],
    queryFn: async () => {
      try {
        const res = await api().privacy.privacyRequestList({ query: {} });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useCreatePrivacyRequest() {
  const queryClient = useQueryClient();
  return useMutation<
    PrivacyRequest,
    ApiError,
    { kind: PrivacyRequestKind; detailTr?: string }
  >({
    mutationFn: async ({ kind, detailTr }) => {
      try {
        const res = await api().privacy.privacyRequestCreate({
          headers: { 'idempotency-key': newIdempotencyKey('kvkk') },
          body: { kind, ...(detailTr !== undefined ? { detailTr } : {}) },
        });
        if (res.status !== 201) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['privacy-requests'] });
    },
  });
}

export function usePrivacyExport() {
  return useMutation<{ jobId: string }, ApiError, { includeVoiceRaw: boolean }>({
    mutationFn: async ({ includeVoiceRaw }) => {
      try {
        const res = await api().privacy.privacyExport({
          headers: { 'idempotency-key': newIdempotencyKey('veriexport') },
          body: { includeVoiceRaw },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/* ── Hesabı sil (A05) ────────────────────────────────────────── */

export function useDeleteAccount() {
  return useMutation<
    { jobId: string; sideEffectsTr: string[] },
    ApiError,
    { confirmText: string; reasonTr?: string }
  >({
    mutationFn: async ({ confirmText, reasonTr }) => {
      try {
        const res = await api().auth.deleteMe({
          headers: { 'idempotency-key': newIdempotencyKey('hesapsil') },
          body: {
            // Sözleşme 'SIL' literal'ı ister; yanlış metni sunucu 422 ile geri çevirir.
            confirmText: confirmText as 'SIL',
            ...(reasonTr !== undefined ? { reasonTr } : {}),
          },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string, sideEffectsTr: res.body.sideEffectsTr };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}
