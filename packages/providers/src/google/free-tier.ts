/**
 * google/free-tier.ts — what the free tier actually gives you, written down honestly.
 *
 * ⚠️ READ THIS BEFORE TRUSTING A NUMBER BELOW. These are the AI Studio free-tier limits as
 * understood at the time of writing (2026-08). Google changes them without notice, per
 * model, and sometimes per country; the authoritative list is
 * `https://ai.google.dev/gemini-api/docs/rate-limits`. Nothing here is enforced by us — the
 * vendor's 429 is the only real limit. The table exists for two reasons that survive being
 * out of date:
 *
 *   1. It documents WHY the pacing defaults in `packages/config` are what they are, so the
 *      next person raising `GOOGLE_LLM_RPM` knows what they are trading against.
 *   2. It makes the shape of the ceiling visible — requests per minute, requests per day,
 *      tokens per minute — which does not change even when the numbers do.
 *
 * The single most important line: THE FREE TIER HAS NO VOICE CLONING. Not at a lower
 * quality, not with a queue — the capability does not exist on any free provider we can
 * reach. That is a product decision, not a configuration one, and `tts/google/adapter.ts`
 * refuses it out loud rather than substituting a stranger's voice for the parent's.
 */

/** One model family's free-tier ceiling. `undefined` = we do not know, not "unlimited". */
export interface FreeTierLimit {
  /** Requests per minute. The binding constraint for a 13-page book. */
  rpm?: number;
  /** Requests per day, reset at midnight US/Pacific. */
  rpd?: number;
  /** Tokens per minute, input + output. */
  tpm?: number;
  /** What we are unsure about, in plain words. Never delete this — update it. */
  note: string;
}

/**
 * Indicative free-tier ceilings, by capability rather than by model id (a model id is a
 * config value and must not appear in code — SPEC §3 rule 6).
 *
 * ⚠️ APPROXIMATE AND UNVERIFIED. Treat every number as "the right order of magnitude".
 */
export const FREE_TIER_LIMITS: Readonly<Record<'text_flash' | 'text_pro' | 'image' | 'tts', FreeTierLimit>> = {
  text_flash: {
    rpm: 10,
    rpd: 250,
    tpm: 250_000,
    note:
      'Flash-sınıfı metin modeli. En dar sınır dakika başına istek; bir kitap 3-6 çağrı ' +
      'demek, yani günlük hak pratikte ~40-80 kitap. Doğrulanmadı.',
  },
  text_pro: {
    rpm: 5,
    rpd: 100,
    tpm: 250_000,
    note:
      'Pro-sınıfı metin modeli. Ücretsiz katmanda bazı dönemlerde HİÇ sunulmadı — açılışta ' +
      '404/PERMISSION_DENIED alırsanız model ücretsiz katmanda yok demektir.',
  },
  image: {
    rpm: 10,
    rpd: 100,
    note:
      'Görsel üretim ücretsiz katmanda en oynak kalem; dönem dönem tamamen kapatıldı. ' +
      'Günlük ~100 görsel = ~7 kitap (13 sayfa + kapak + stil plakası). Doğrulanmadı.',
  },
  tts: {
    rpm: 3,
    rpd: 15,
    tpm: 10_000,
    note:
      '⚠️ EN DAR KAPI. Günde ~15 istek, dakikada 3. Bir kitabın seslendirmesi 12-14 chunk ' +
      "eder — yani ücretsiz katmanda GÜNDE YAKLAŞIK BİR KİTAP seslendirilebilir. " +
      'TTS_CHUNK_MAX_CHARS yükseltmek chunk sayısını düşürür ve doğrudan bu sınırı rahatlatır.',
  },
};

/**
 * What the free tier cannot do at all, with the Turkish sentence the parent is shown when
 * they ask for it. Never degraded silently: a parent who was promised their own voice and
 * gets a stranger's has been lied to, and would only find out at bedtime.
 */
export const FREE_TIER_UNSUPPORTED_TR = {
  voiceCloning:
    'Kendi sesinizle okuma özelliği şu anda kapalı. Bu özellik ücretli ses sağlayıcımıza ' +
    'bağlı ve henüz açmadık — hikayeyi hazır anlatıcı seslerinden biriyle dinleyebilirsiniz. ' +
    'Özellik açıldığında haber vereceğiz.',
} as const;
