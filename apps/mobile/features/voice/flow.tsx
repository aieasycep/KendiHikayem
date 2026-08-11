/**
 * Voice onboarding flow state (V01–V09), mounted at app/(app)/ses/_layout.tsx.
 *
 * Keeps what the V-screens must share while navigating:
 *   profileId + naming, the one-time script bundle (TTL 15 dk), the latest
 *   server-reported progress ("72 / 110 saniye") and per-step take results —
 *   so a passage can be re-recorded ALONE without restarting the flow.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type {
  SubmitTakeRes,
  VoiceRelation,
  VoiceScriptBundle,
  VoiceStep,
} from '@kendihikayem/contract';

export interface VoiceFlowState {
  profileId?: string;
  displayName: string;
  relation: VoiceRelation;
  script?: VoiceScriptBundle;
  /** Last server progress — drives the "xx / 110 saniye" bar. */
  progress?: SubmitTakeRes['progress'];
  takes: Partial<Record<VoiceStep, SubmitTakeRes>>;
}

interface VoiceFlowContextValue {
  state: VoiceFlowState;
  setProfile: (profileId: string, displayName: string, relation: VoiceRelation) => void;
  setScript: (script: VoiceScriptBundle) => void;
  recordTake: (step: VoiceStep, result: SubmitTakeRes) => void;
  /** After redo(fromStep) — those steps must be re-recorded. */
  clearFrom: (fromStep?: VoiceStep) => void;
  reset: () => void;
}

const INITIAL: VoiceFlowState = { displayName: '', relation: 'anne', takes: {} };

const VoiceFlowContext = createContext<VoiceFlowContextValue | undefined>(undefined);

const STEP_ORDER: VoiceStep[] = [
  'consent_clip',
  'passage_1',
  'passage_2',
  'passage_3',
  'passage_4',
];

export function VoiceFlowProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<VoiceFlowState>(INITIAL);

  // Actions are IDENTITY-STABLE (setState is stable): effects may safely list
  // them as dependencies without re-running on every state change.
  const setProfile = useCallback(
    (profileId: string, displayName: string, relation: VoiceRelation) => {
      setState((prev) => ({ ...prev, profileId, displayName, relation }));
    },
    [],
  );
  const setScript = useCallback((script: VoiceScriptBundle) => {
    setState((prev) => ({ ...prev, script }));
  }, []);
  const recordTake = useCallback((step: VoiceStep, result: SubmitTakeRes) => {
    setState((prev) => ({
      ...prev,
      takes: { ...prev.takes, [step]: result },
      progress: result.progress,
    }));
  }, []);
  const clearFrom = useCallback((fromStep?: VoiceStep) => {
    setState((prev) => {
      if (fromStep === undefined) return { ...prev, takes: {}, progress: undefined };
      const fromIndex = STEP_ORDER.indexOf(fromStep);
      const takes = { ...prev.takes };
      for (const step of STEP_ORDER.slice(fromIndex)) delete takes[step];
      return { ...prev, takes };
    });
  }, []);
  const reset = useCallback(() => {
    setState(INITIAL);
  }, []);

  const value = useMemo<VoiceFlowContextValue>(
    () => ({ state, setProfile, setScript, recordTake, clearFrom, reset }),
    [state, setProfile, setScript, recordTake, clearFrom, reset],
  );

  return <VoiceFlowContext.Provider value={value}>{children}</VoiceFlowContext.Provider>;
}

export function useVoiceFlow(): VoiceFlowContextValue {
  const value = useContext(VoiceFlowContext);
  if (value === undefined) {
    throw new Error('useVoiceFlow yalnızca (app)/ses altındaki ekranlarda kullanılabilir.');
  }
  return value;
}

export { STEP_ORDER as VOICE_STEP_ORDER };
