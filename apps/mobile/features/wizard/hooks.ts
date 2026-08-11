/**
 * Wizard-only hooks (W01 child management).
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { AgeBand, ApiError, Child } from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';

export interface NewChildInput {
  givenName: string;
  ageBand: AgeBand;
}

export function useCreateChild(): UseMutationResult<Child, ApiError, NewChildInput> {
  return useMutation<Child, ApiError, NewChildInput>({
    mutationFn: async (input) => {
      try {
        const res = await api().children.create({
          body: { givenName: input.givenName, ageBand: input.ageBand, interests: [] },
          headers: { 'idempotency-key': newIdempotencyKey('cocuk') },
        });
        if (res.status !== 201) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
}
