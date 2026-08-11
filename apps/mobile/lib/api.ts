/**
 * The single place the mobile app talks to the outside world.
 *
 * No screen may call `fetch` directly — everything goes through here so that flipping
 * `EXPO_PUBLIC_API_MODE` between `mock` and `live` swaps the entire data source at once.
 * That is what makes the debug APK usable with no backend at all.
 *
 * STATUS: deliberate stub. A0-CONTRACT owns packages/contract + packages/mock and will
 * replace the bodies below with a typed ts-rest client and real MSW-backed fixtures.
 * Keep this module's *shape* (one async function per screen need) when doing so.
 */

import Constants from 'expo-constants';

import { DEMO_STORIES, DEMO_VOICE_PROFILES, type DemoStory } from './fixtures';

export type ApiMode = 'mock' | 'live';

interface ExtraConfig {
  apiMode?: string;
  apiBaseUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

/** Build-time value from app.config.ts; falls back to mock so the app never hard-fails. */
export const API_MODE: ApiMode = extra.apiMode === 'live' ? 'live' : 'mock';
export const API_BASE_URL: string = extra.apiBaseUrl ?? 'http://10.0.2.2:3001';

export const isMockMode = (): boolean => API_MODE === 'mock';

/** Turkish label for the mode chip shown in Ayarlar — helps testers report bugs precisely. */
export const apiModeLabelTr = (): string =>
  API_MODE === 'mock' ? 'Demo veri (mock)' : `Canlı API — ${API_BASE_URL}`;

class NotImplementedError extends Error {
  constructor(operation: string) {
    super(`${operation}: live mode is not wired up yet (A0-CONTRACT)`);
    this.name = 'NotImplementedError';
  }
}

/** Simulated latency so loading states are visible in the demo build. */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function listStories(): Promise<DemoStory[]> {
  if (isMockMode()) {
    await delay(250);
    return DEMO_STORIES;
  }
  throw new NotImplementedError('listStories');
}

export async function getStory(id: string): Promise<DemoStory | undefined> {
  if (isMockMode()) {
    await delay(150);
    return DEMO_STORIES.find((story) => story.id === id);
  }
  throw new NotImplementedError('getStory');
}

export async function listVoiceProfiles(): Promise<typeof DEMO_VOICE_PROFILES> {
  if (isMockMode()) {
    await delay(150);
    return DEMO_VOICE_PROFILES;
  }
  throw new NotImplementedError('listVoiceProfiles');
}
