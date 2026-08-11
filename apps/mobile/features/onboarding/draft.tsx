/**
 * Wizard draft — the single in-memory state both story flows share.
 *
 *   S02–S06 (first-run onboarding, guest) and W01–W07 (registered wizard) collect
 *   the same `CreateStoryReq`; only the entry screens differ. Keeping one draft
 *   means the guest → OTP → create path never loses a field (SPEC §11.0:
 *   "misafir oturumu birleşir, hiçbir veri kaybolmaz").
 *
 * The provider mounts at the root layout so navigation between the
 * (onboarding) group and the (app)/sihirbaz group keeps the draft alive.
 */

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';

import type { AgeBand, PageCount } from '@kendihikayem/contract';

export interface VoiceChoice {
  kind: 'system' | 'cloned';
  /** system voice code, e.g. 'deniz'. */
  systemVoiceCode?: string;
  /** cloned profile id. */
  voiceProfileId?: string;
  labelTr: string;
}

export interface WizardDraft {
  /** Registered flow (W01): which child. Guest flow leaves it undefined. */
  childId?: string;
  childName: string;
  ageBand: AgeBand;
  themeCode?: string;
  heroName: string;
  /** Hero is the child themself (default) or a made-up character. */
  heroIsChild: boolean;
  /** Karakter Kurucu selections — catalog codes only, NEVER free text, NEVER a photo. */
  characterBuilder: Record<string, string>;
  artStyleCode?: string;
  pageCount: PageCount;
  /** W05 ince ayar. */
  lessonHintTr?: string;
  culturalTags: string[];
  /** Religious content is strictly opt-in and defaults to OFF (SPEC §11.1). */
  religiousOptIn: boolean;
  freeIdeaTr?: string;
  /** ⭐ "Elif'in kahramanını tekrar kullan" — skips the character builder. */
  reuseCharacterId?: string;
  /** W06 voice preference — used after KAPI 2 when narration starts. */
  voiceChoice?: VoiceChoice;
}

const INITIAL: WizardDraft = {
  childName: '',
  ageBand: '3-5',
  heroName: '',
  heroIsChild: true,
  characterBuilder: {},
  pageCount: 12,
  culturalTags: [],
  religiousOptIn: false,
};

type Action =
  | { type: 'patch'; patch: Partial<WizardDraft> }
  | { type: 'setBuilderField'; field: string; code: string }
  | { type: 'reset' };

function reducer(draft: WizardDraft, action: Action): WizardDraft {
  switch (action.type) {
    case 'patch':
      return { ...draft, ...action.patch };
    case 'setBuilderField':
      return {
        ...draft,
        characterBuilder: { ...draft.characterBuilder, [action.field]: action.code },
      };
    case 'reset':
      return INITIAL;
    default:
      return draft;
  }
}

interface DraftContextValue {
  draft: WizardDraft;
  patch: (patch: Partial<WizardDraft>) => void;
  setBuilderField: (field: string, code: string) => void;
  reset: () => void;
}

const DraftContext = createContext<DraftContextValue | undefined>(undefined);

export function WizardDraftProvider({ children }: { children: ReactNode }): ReactNode {
  const [draft, dispatch] = useReducer(reducer, INITIAL);
  // Stable actions (dispatch is stable): safe as effect dependencies.
  const patch = useCallback((value: Partial<WizardDraft>) => {
    dispatch({ type: 'patch', patch: value });
  }, []);
  const setBuilderField = useCallback((field: string, code: string) => {
    dispatch({ type: 'setBuilderField', field, code });
  }, []);
  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);
  const value = useMemo<DraftContextValue>(
    () => ({ draft, patch, setBuilderField, reset }),
    [draft, patch, setBuilderField, reset],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useWizardDraft(): DraftContextValue {
  const value = useContext(DraftContext);
  if (value === undefined) {
    throw new Error('useWizardDraft, WizardDraftProvider içinde çağrılmalı (app/_layout.tsx).');
  }
  return value;
}
