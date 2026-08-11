/**
 * Session store — guest-first auth with OTP upgrade (SPEC §11.0 "değer önce, hesap sonra").
 *
 * Flow:
 *   1. App start → `ensureGuestSession()` opens a guest session with a per-install
 *      deviceId. The wizard runs entirely on this session.
 *   2. At "Hikayemi Oluştur" the user verifies a phone (S07). `verifyOtp` passes the
 *      guest access token as `mergeGuestToken`, so everything created as a guest —
 *      children, drafts, credits — moves to the account. NOTHING is lost.
 *
 * State lives in memory and is mirrored to SecureStore (best effort) so a cold
 * start can resume the session. Subscribers (React) use `useSession()`.
 */

import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

import type { Me } from '@kendihikayem/contract';

import { api, newIdempotencyKey, setAccessToken, toApiError } from './api';

const KEY_DEVICE_ID = 'kh.deviceId';
const KEY_ACCESS = 'kh.accessToken';
const KEY_GUEST = 'kh.guestToken';

export interface SessionState {
  /** 'idle' → not bootstrapped yet; 'guest' | 'user' → have a token. */
  phase: 'idle' | 'guest' | 'user';
  me?: Me;
  /** Guest access token kept for merging at OTP verification. */
  guestToken?: string;
}

let state: SessionState = { phase: 'idle' };
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): SessionState {
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

/** True when the current session may call auth-required endpoints as a real user. */
export function isSignedIn(): boolean {
  return state.phase === 'user';
}

async function secureGet(key: string): Promise<string | undefined> {
  try {
    return (await SecureStore.getItemAsync(key)) ?? undefined;
  } catch {
    return undefined;
  }
}

async function secureSet(key: string, value: string | undefined): Promise<void> {
  try {
    if (value === undefined) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* SecureStore missing (e.g. tests) — memory-only session is fine. */
  }
}

async function deviceId(): Promise<string> {
  const existing = await secureGet(KEY_DEVICE_ID);
  if (existing !== undefined) return existing;
  const created = `cihaz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await secureSet(KEY_DEVICE_ID, created);
  return created;
}

let bootstrapping: Promise<void> | undefined;

/**
 * Idempotent bootstrap: restores a stored session or opens a guest one.
 * Never throws — a failed bootstrap leaves phase 'idle' and screens retry on demand.
 */
export function ensureGuestSession(): Promise<void> {
  bootstrapping ??= (async () => {
    if (state.phase !== 'idle') return;

    const storedAccess = await secureGet(KEY_ACCESS);
    if (storedAccess !== undefined) {
      setAccessToken(storedAccess);
      const meRes = await api()
        .auth.me()
        .catch(() => undefined);
      if (meRes !== undefined && meRes.status === 200) {
        setState({ phase: meRes.body.isGuest ? 'guest' : 'user', me: meRes.body });
        return;
      }
      setAccessToken(undefined);
      await secureSet(KEY_ACCESS, undefined);
    }

    try {
      const res = await api().auth.guest({
        body: { deviceId: await deviceId() },
        headers: { 'idempotency-key': newIdempotencyKey('misafir') },
      });
      if (res.status === 200) {
        setAccessToken(res.body.accessToken);
        await secureSet(KEY_ACCESS, res.body.accessToken);
        await secureSet(KEY_GUEST, res.body.accessToken);
        setState({ phase: 'guest', me: res.body.user, guestToken: res.body.accessToken });
      }
    } catch {
      /* Offline live-mode start: screens show their own error states. */
    }
  })().finally(() => {
    bootstrapping = undefined;
  });
  return bootstrapping;
}

export interface OtpChallenge {
  challengeId: string;
  destinationMasked: string;
  resendAfterSec: number;
  expiresInSec: number;
}

/** S07 step 1 — send the SMS code. Throws `ApiError` on failure. */
export async function startOtp(phone: string): Promise<OtpChallenge> {
  try {
    const res = await api().auth.otpStart({
      body: { channel: 'sms', destination: phone },
      headers: { 'idempotency-key': newIdempotencyKey('otp') },
    });
    if (res.status !== 200) throw res.body;
    return res.body;
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * S07 step 2 — verify the code and MERGE the guest session.
 * On success the store phase becomes 'user' and the api client carries the new token.
 */
export async function verifyOtp(challengeId: string, code: string): Promise<Me> {
  const guestToken = state.guestToken ?? (await secureGet(KEY_GUEST));
  try {
    const res = await api().auth.otpVerify({
      body: {
        challengeId,
        code,
        deviceId: await deviceId(),
        ...(guestToken !== undefined ? { mergeGuestToken: guestToken } : {}),
      },
      headers: { 'idempotency-key': newIdempotencyKey('otp-dogrula') },
    });
    if (res.status !== 200) throw res.body;
    setAccessToken(res.body.accessToken);
    await secureSet(KEY_ACCESS, res.body.accessToken);
    await secureSet(KEY_GUEST, undefined);
    setState({ phase: 'user', me: res.body.user });
    return res.body.user;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Refresh `me` after consent or entitlement changes. Best effort. */
export async function refreshMe(): Promise<void> {
  const res = await api()
    .auth.me()
    .catch(() => undefined);
  if (res !== undefined && res.status === 200) {
    setState({ ...state, phase: res.body.isGuest ? 'guest' : 'user', me: res.body });
  }
}

/**
 * A06 / Figma Profile "Çıkış Yap" — oturumu kapatır (`POST /v1/auth/logout`),
 * saklanan jetonları temizler ve uygulamayı temiz bir misafir oturumuna döndürür.
 * Sunucu hatası çıkışı ENGELLEMEZ: yerel jetonlar her durumda silinir.
 */
export async function signOut(): Promise<void> {
  await api()
    .auth.logout({ body: {}, headers: { 'idempotency-key': newIdempotencyKey('cikis') } })
    .catch(() => undefined);
  setAccessToken(undefined);
  await secureSet(KEY_ACCESS, undefined);
  await secureSet(KEY_GUEST, undefined);
  setState({ phase: 'idle' });
  await ensureGuestSession();
}
