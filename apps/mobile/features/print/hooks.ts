/**
 * features/print/hooks.ts — baskı akışı (B01–B08) veri kancaları.
 *
 * 6502 CAYMA HAKKI DİSİPLİNİ (contract/print.ts):
 *  - `QuoteRes.withdrawalNoticeTr` ekranda BİREBİR, ayrı bir kutuda basılır.
 *  - `createOrder` gövdesindeki `withdrawalWaiverAccepted: true` LİTERAL'dir —
 *    onay kutusu işaretlenmeden bu kancayı çağırmak zaten derlenmez/422 olur.
 *  - Onaylanan metinlerin belge kimlikleri (`withdrawalDocId`,
 *    `distanceContractDocId`) tekliften siparişe AYNEN taşınır (kanıt zinciri).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ApiError,
  BookBuild,
  BookFormat,
  Order,
  QuoteRes,
  ShippingAddress,
} from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

export function useBookFormats() {
  return useQuery<BookFormat[], ApiError>({
    queryKey: ['book-formats'],
    queryFn: async () => {
      try {
        const res = await api().catalog.bookFormats();
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
    staleTime: 10 * 60_000,
  });
}

export function useCreateBookBuild() {
  return useMutation<
    { buildId: string; jobId: string },
    ApiError,
    {
      storyId: string;
      formatCode: string;
      dedicationTr?: string;
      includeQr: boolean;
      qrRenditionId?: string;
    }
  >({
    mutationFn: async ({ storyId, formatCode, dedicationTr, includeQr, qrRenditionId }) => {
      try {
        const res = await api().print.createBookBuild({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('kitap') },
          body: {
            formatCode,
            ...(dedicationTr !== undefined && dedicationTr.length > 0 ? { dedicationTr } : {}),
            includeQr,
            ...(qrRenditionId !== undefined ? { qrRenditionId } : {}),
          },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { buildId: res.body.buildId as string, jobId: res.body.job.jobId as string };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useBookBuild(buildId: string | undefined) {
  return useQuery<BookBuild, ApiError>({
    queryKey: ['book-build', buildId],
    enabled: buildId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().print.getBookBuild({ params: { buildId: buildId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    refetchInterval: (query) => (query.state.data?.status === 'building' ? 2_500 : false),
  });
}

/** B06 — teklif. Adres ili/ilçesi belli olunca çağrılır; cayma metni bu yanıttadır. */
export function useQuote() {
  return useMutation<
    QuoteRes,
    ApiError,
    { buildId: string; quantity: number; city: string; district: string }
  >({
    mutationFn: async (body) => {
      try {
        const res = await api().print.quote({
          headers: { 'idempotency-key': newIdempotencyKey('teklif') },
          body,
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation<
    { order: Order; paymentUrl: string },
    ApiError,
    {
      buildId: string;
      quantity: number;
      shipping: ShippingAddress;
      giftNoteTr?: string;
      quote: QuoteRes;
      installment?: number;
    }
  >({
    mutationFn: async ({ buildId, quantity, shipping, giftNoteTr, quote, installment }) => {
      try {
        const res = await api().print.createOrder({
          headers: { 'idempotency-key': newIdempotencyKey('siparis') },
          body: {
            buildId,
            quantity,
            shipping,
            ...(giftNoteTr !== undefined && giftNoteTr.length > 0 ? { giftNoteTr } : {}),
            /* Ekrandaki CheckRow işaretlenmeden bu kancaya hiç gelinmez (B06). */
            withdrawalWaiverAccepted: true,
            withdrawalDocId: quote.withdrawalDocId as string,
            distanceContractDocId: quote.distanceContractDocId as string,
            ...(installment !== undefined && installment > 1 ? { installment } : {}),
          },
        });
        if (res.status !== 201) throw asApiError(res.body);
        return { order: res.body.order, paymentUrl: res.body.payment.redirectUrl };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useOrders() {
  return useQuery<Order[], ApiError>({
    queryKey: ['orders'],
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

export function useOrder(orderId: string | undefined) {
  return useQuery<Order, ApiError>({
    queryKey: ['order', orderId],
    enabled: orderId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().print.getOrder({ params: { orderId: orderId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation<Order, ApiError, { orderId: string }>({
    mutationFn: async ({ orderId }) => {
      try {
        const res = await api().print.cancelOrder({
          params: { orderId },
          headers: { 'idempotency-key': newIdempotencyKey('iptal') },
          body: {},
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (order) => {
      queryClient.setQueryData(['order', order.id], order);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
