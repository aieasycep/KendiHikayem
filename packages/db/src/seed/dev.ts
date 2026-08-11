/**
 * Development fixture: one parent, two children, one cloned voice, one complete story.
 *
 * "Complete" means the whole chain is present and consistent — consent → voice profile →
 * story → 12 pages with real Turkish text → narration with page marks → entitlement with a
 * settled cost reservation. That is what makes it useful: a developer can open any screen,
 * and a worker can be pointed at a job that already has the rows it expects.
 *
 * Everything is keyed by a deterministic UUID (see ids.ts), so the seed is re-runnable.
 */
import { eq } from 'drizzle-orm';

import type { Database } from '../client.ts';
import {
  assets,
  audioPageMarks,
  audioRenditions,
  children,
  consents,
  contentCache,
  costReservations,
  creditLedger,
  entitlements,
  jobSteps,
  jobs,
  providerUsage,
  stories,
  storyCharacters,
  storyPages,
  users,
  voiceProfiles,
  voiceProviderBindings,
  voiceTakes,
} from '../schema/index.ts';
import { consentDocumentSha } from './catalog.ts';
import { seedId, sha256 } from './ids.ts';

const NOW = new Date('2026-02-01T20:00:00Z');
const TEN_YEARS = new Date('2036-02-01T20:00:00Z');
const THIRTY_DAYS = new Date('2026-03-03T20:00:00Z');
const PERIOD_END = new Date('2026-03-01T00:00:00Z');

export const DEV_USER_ID = seedId('user:ayse');
const ELIF_ID = seedId('child:elif');
const KAAN_ID = seedId('child:kaan');
const VOICE_PROFILE_ID = seedId('voice_profile:anne');
const CONSENT_ID = seedId('consent:ses_biyometrik');
const STORY_ID = seedId('story:elif_yildiz');
const HERO_ID = seedId('character:elif_hero');
const RENDITION_ID = seedId('rendition:elif_yildiz_anne');
const JOB_ID = seedId('job:story_fill');

/** The twelve spreads. Turkish text a parent could actually read aloud. */
const PAGES: Array<{ text: string; scene: string; emotion: string; prompt: string }> = [
  {
    text: 'Elif yatağına uzandığında, perdenin arkasında bir ışık kımıldadı. Küçüktü, tam bir düğme kadar.',
    scene: 'Girl in bed, a small glowing light behind the curtain',
    emotion: 'sakin',
    prompt: 'a child lying in bed at night, a tiny warm light glowing behind a linen curtain',
  },
  {
    text: '"Merhaba," dedi ışık. Sesi, uzaktan gelen bir çıngırak gibiydi. "Ben yolumu kaybettim."',
    scene: 'The light hovers by the bed, the girl sits up',
    emotion: 'merak',
    prompt: 'a small glowing star hovering beside a child sitting up in bed, warm night light',
  },
  {
    text: 'Elif yorganı ittirdi. "Yıldızlar kaybolmaz ki," dedi. Işık usulca yere kondu: "Bazen olur."',
    scene: 'The star lands on the wooden floor',
    emotion: 'merak',
    prompt: 'a tiny star resting on a wooden bedroom floor, a barefoot child leaning over it',
  },
  {
    text: 'Pencereyi açtılar. Dışarıda gece, ıslak çimen ve uzak bir köpek havlaması vardı.',
    scene: 'Open window, night garden below',
    emotion: 'merak',
    prompt: 'an open bedroom window at night looking over a quiet garden, damp grass, soft moon',
  },
  {
    text: 'Bahçedeki ceviz ağacı, dallarını biraz aralayıp yol verdi. "Yukarısı," dedi yaprakları.',
    scene: 'Walnut tree parting its branches',
    emotion: 'merak',
    prompt: 'a large walnut tree at night gently parting its branches, leaves catching moonlight',
  },
  {
    text: 'Ama merdiven yoktu. Elif bir an durdu. Yukarısı çok yukarıydı ve gece çok genişti.',
    scene: 'Girl looking up, hesitating',
    emotion: 'hafif_endise',
    prompt: 'a child at the foot of a tall tree looking up at a wide night sky, hesitant posture',
  },
  {
    text: '"Korkuyor musun?" diye sordu ışık. "Biraz," dedi Elif. "Ben de," dedi ışık. Bu ikisine iyi geldi.',
    scene: 'The child and the star, close-up, both small against the dark',
    emotion: 'hafif_endise',
    prompt: 'close up of a child and a small glowing star, both tiny against a dark blue night',
  },
  {
    text: 'Önce en alçak dala tutundular. Sonra bir tanesine daha. Gece, tırmandıkça yumuşadı.',
    scene: 'Climbing the branches together',
    emotion: 'cozulme',
    prompt: 'a child carefully climbing the low branches of a big tree, a star floating alongside',
  },
  {
    text: 'En üstteki dalda rüzgâr durdu. Gökyüzü, tam da orada, bir avuç kadar yakındı.',
    scene: 'Top branch, sky very close',
    emotion: 'cozulme',
    prompt: 'a child sitting on the topmost branch of a tree, the starry sky feeling within reach',
  },
  {
    text: 'Işık bir adım attı ve yerine oturdu. Gökyüzünde küçücük bir boşluk vardı; tam ona göre.',
    scene: 'The star settling into a gap in the sky',
    emotion: 'cozulme',
    prompt: 'a small star gently settling into a tiny empty space among other stars, warm glow',
  },
  {
    text: '"Teşekkür ederim Elif," dedi. "Artık ışığım oradan sana düşecek." Ve gerçekten düştü.',
    scene: 'A beam of light reaching down to the child',
    emotion: 'sicak_kapanis',
    prompt: 'a thin warm beam of starlight reaching down to a smiling child in a tree at night',
  },
  {
    text: 'Elif yatağına döndüğünde perde hâlâ aydınlıktı. Gözlerini kapattı. İyi geceler Elif.',
    scene: 'Back in bed, curtain still glowing',
    emotion: 'sicak_kapanis',
    prompt: 'a child asleep in bed, the curtain softly glowing, cosy quiet bedroom, warm palette',
  },
];

const STYLE_DNA_SUFFIX =
  ', soft watercolour children book illustration, visible paper grain, muted warm palette, ' +
  'text safe zone kept clear at the bottom';

export async function seedDevData(db: Database): Promise<Record<string, number>> {
  /* ── parent ─────────────────────────────────────────────────────────────── */
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      isGuest: false,
      phoneE164: '+905321112233',
      email: 'ayse@ornek.com',
      displayName: 'Ayşe',
      isAdultDeclared: true,
      adultDeclaredAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();

  /* ── children — no photo, no full birth date ────────────────────────────── */
  await db
    .insert(children)
    .values([
      {
        id: ELIF_ID,
        userId: DEV_USER_ID,
        givenName: 'Elif',
        nickname: 'Elifim',
        birthYear: 2019,
        ageBand: '6-8',
        genderPresentation: 'kiz',
        interests: ['uzay', 'hayvanlar', 'muzik'],
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: KAAN_ID,
        userId: DEV_USER_ID,
        givenName: 'Kaan',
        birthYear: 2022,
        ageBand: '3-5',
        genderPresentation: 'erkek',
        interests: ['arabalar', 'dinozorlar'],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .onConflictDoNothing();

  /* ── assets ─────────────────────────────────────────────────────────────── */
  const assetRows = [
    {
      id: seedId('asset:consent_clip'),
      kind: 'voice_consent_clip',
      bucket: 'kh-voice-raw',
      storageKey: `voice/${VOICE_PROFILE_ID}/consent.wav`,
      mimeType: 'audio/wav',
      kmsKeyAlias: 'alias/kh-voice-cmk',
      durationMs: 12_400,
      // The proof of consent outlives the account: ten-year hold, never auto-purged.
      retentionClass: 'legal_hold_10y',
      purgeAfter: TEN_YEARS,
    },
    {
      id: seedId('asset:voice_reference'),
      kind: 'voice_reference_raw',
      bucket: 'kh-voice-raw',
      storageKey: `voice/${VOICE_PROFILE_ID}/reference.wav`,
      mimeType: 'audio/wav',
      kmsKeyAlias: 'alias/kh-voice-cmk',
      durationMs: 104_000,
      // Raw voice is data minimisation territory: gone in 30 days, model kept.
      retentionClass: 'ephemeral_30d',
      purgeAfter: THIRTY_DAYS,
    },
    {
      id: seedId('asset:voice_preview'),
      kind: 'voice_preview',
      bucket: 'kh-media',
      storageKey: `voice/${VOICE_PROFILE_ID}/preview.mp3`,
      mimeType: 'audio/mpeg',
      durationMs: 9_000,
      retentionClass: 'standard',
    },
    {
      id: seedId('asset:tts_full'),
      kind: 'tts_full',
      bucket: 'kh-media',
      storageKey: `story/${STORY_ID}/narration.mp3`,
      mimeType: 'audio/mpeg',
      durationMs: 186_000,
      retentionClass: 'standard',
    },
    {
      id: seedId('asset:tts_alignment'),
      kind: 'tts_alignment_json',
      bucket: 'kh-media',
      storageKey: `story/${STORY_ID}/alignment.json`,
      mimeType: 'application/json',
      retentionClass: 'standard',
    },
    {
      id: seedId('asset:character_sheet'),
      kind: 'image_character_sheet',
      bucket: 'kh-media',
      storageKey: `story/${STORY_ID}/character-sheet.png`,
      mimeType: 'image/png',
      widthPx: 2048,
      heightPx: 2048,
      retentionClass: 'standard',
    },
    ...PAGES.map((_, i) => ({
      id: seedId(`asset:page:${i + 1}`),
      kind: 'image_page_2k',
      bucket: 'kh-media',
      storageKey: `story/${STORY_ID}/page-${String(i + 1).padStart(2, '0')}-2k.png`,
      mimeType: 'image/png',
      widthPx: 2048,
      heightPx: 2048,
      retentionClass: 'standard',
    })),
  ].map((row) => ({ ...row, ownerUserId: DEV_USER_ID, provider: 'mock', createdAt: NOW }));

  await db.insert(assets).values(assetRows).onConflictDoNothing();

  /* ── consent — the proof chain ──────────────────────────────────────────── */
  await db
    .insert(consents)
    .values({
      id: CONSENT_ID,
      userId: DEV_USER_ID,
      subject: 'ses_biyometrik',
      granted: true,
      documentId: seedId('legal:riza_ses_biyometrik'),
      // Hash of the text as it was shown. If the document is later edited in place, this
      // no longer matches — and that mismatch is exactly the evidence we need.
      documentSha256: consentDocumentSha,
      method: 'voice',
      evidenceAssetId: seedId('asset:consent_clip'),
      providerConsentId: 'mock_cons_0001',
      appVersion: '0.1.0',
      grantedAt: NOW,
      purgeAfter: TEN_YEARS,
    })
    .onConflictDoNothing();

  /* ── voice profile ──────────────────────────────────────────────────────── */
  await db
    .insert(voiceProfiles)
    .values({
      id: VOICE_PROFILE_ID,
      userId: DEV_USER_ID,
      displayName: 'Anne',
      relation: 'anne',
      status: 'ready',
      consentId: CONSENT_ID,
      consentClipAssetId: seedId('asset:consent_clip'),
      referenceAssetId: seedId('asset:voice_reference'),
      previewAssetId: seedId('asset:voice_preview'),
      quality: {
        snrDb: 31.4,
        clippingPct: 0.02,
        peakDbfs: -3.1,
        wpm: 132,
        rt60Ms: 210,
        bandwidthHz: 16_000,
        silenceRatio: 0.12,
      },
      qualityScore: '0.884',
      asrMatchScore: '0.962',
      acceptedAt: NOW,
      lastUsedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();

  await db
    .insert(voiceTakes)
    .values([
      {
        id: seedId('voice_take:consent'),
        voiceProfileId: VOICE_PROFILE_ID,
        step: 'consent_clip',
        attempt: 1,
        assetId: seedId('asset:consent_clip'),
        scriptId: seedId('voice_script:consent_clip'),
        asrSimilarity: '0.971',
        accepted: true,
        createdAt: NOW,
      },
      {
        id: seedId('voice_take:passage_1_a1'),
        voiceProfileId: VOICE_PROFILE_ID,
        step: 'passage_1',
        attempt: 1,
        assetId: seedId('asset:voice_reference'),
        scriptId: seedId('voice_script:passage_1'),
        asrSimilarity: '0.612',
        accepted: false,
        // The parent gets Turkish coaching derived from these codes, not this array.
        issues: ['GURULTULU', 'KISA'],
        createdAt: NOW,
      },
      {
        id: seedId('voice_take:passage_1_a2'),
        voiceProfileId: VOICE_PROFILE_ID,
        step: 'passage_1',
        attempt: 2,
        assetId: seedId('asset:voice_reference'),
        scriptId: seedId('voice_script:passage_1'),
        asrSimilarity: '0.958',
        accepted: true,
        createdAt: NOW,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(voiceProviderBindings)
    .values({
      id: seedId('vpb:mock'),
      voiceProfileId: VOICE_PROFILE_ID,
      provider: 'cartesia',
      providerVoiceId: 'mock-cloned-anne',
      providerConsentId: 'mock_cons_0001',
      occupiesSlot: true,
      isEphemeral: false,
      state: 'active',
      lastUsedAt: NOW,
      createdAt: NOW,
    })
    .onConflictDoNothing();

  /* ── story ──────────────────────────────────────────────────────────────── */
  await db
    .insert(stories)
    .values({
      id: STORY_ID,
      userId: DEV_USER_ID,
      childId: ELIF_ID,
      title: 'Elif ve Yolunu Kaybeden Yıldız',
      ageBand: '6-8',
      themeCode: 'uyku_oncesi',
      artStyleCode: 'suluboya',
      heroName: 'Elif',
      heroIsChild: true,
      pageCount: 12,
      status: 'approved',
      lessonTr: 'Korkmak, cesaretin karşıtı değildir; birlikte tırmanmanın başlangıcıdır.',
      requestInput: {
        cocuk: 'Elif',
        tema: 'uyku_oncesi',
        istek: 'gece korkusu olmayan, yıldızlı bir uyku masalı',
        sanitize: true,
      },
      outline: {
        kitap_meta: { baslik: 'Elif ve Yolunu Kaybeden Yıldız', spread: 12 },
        karakter_kanonu: { kahraman: 'Elif', yardimci: 'Küçük Yıldız' },
        sahne_ozeti: PAGES.map((p, i) => ({ sayfa: i + 1, ozet: p.scene })),
      },
      safety: { age_rubric: 0.96, judge: 'pass', flags: [] },
      modelMeta: {
        stage1: { model: 'mock-outline', usage: { input: 820, output: 640 } },
        stage2: { model: 'mock-fill', usage: { input: 1_940, output: 2_310 } },
      },
      costUsd: '0.4210',
      approvedAt: NOW,
      readyAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();

  await db
    .insert(storyCharacters)
    .values({
      id: HERO_ID,
      storyId: STORY_ID,
      role: 'kahraman',
      nameTr: 'Elif',
      canonEn:
        'Elif, a 7 year old girl, warm olive skin, curly brown shoulder-length hair, ' +
        'hazel eyes, freckles across the nose, yellow dungarees over a white tee, ' +
        'carries a small worn teddy bear',
      builderInput: {
        ten_tonu: 'bugday',
        sac_rengi: 'kahverengi',
        sac_tipi: 'kivircik',
        sac_uzunluk: 'omuz',
        goz_rengi: 'ela',
        cil: 'var',
        kiyafet: 'sari_tulum',
        favori_oyuncak: 'pelus_ayi',
      },
      characterSheetAssetId: seedId('asset:character_sheet'),
      isPrimary: true,
      reusableForChildId: ELIF_ID,
      createdAt: NOW,
    })
    .onConflictDoNothing();

  // Deferred until the character exists — this is the circular FK from schema/children.ts.
  await db
    .update(children)
    .set({ defaultCharacterId: HERO_ID })
    .where(eq(children.id, ELIF_ID));

  const pageRows = PAGES.map((page, i) => {
    const promptEn = page.prompt + STYLE_DNA_SUFFIX;
    return {
      id: seedId(`story_page:${i + 1}`),
      storyId: STORY_ID,
      pageNo: i + 1,
      textTr: page.text,
      // TTS cache key: unchanged text is never re-narrated.
      textSha256: sha256(page.text),
      sceneSummaryTr: page.scene,
      illustrationPromptEn: promptEn,
      // Image cache key: unchanged prompt is never re-rendered.
      promptSha256: sha256(promptEn),
      emotion: page.emotion,
      timeOfDay: 'gece',
      camera: i % 3 === 0 ? 'wide' : 'medium',
      textSafeZone: 'bottom',
      wordCount: page.text.split(/\s+/).length,
      imageAssetId: seedId(`asset:page:${i + 1}`),
      imageStatus: 'ready',
      imageAttempts: 1,
      imageQa: { identityCosine: 0.78, ocrHits: 0, paletteDeltaE: 3.2, safeZoneVariance: 0.04 },
      createdAt: NOW,
      updatedAt: NOW,
    };
  });
  await db.insert(storyPages).values(pageRows).onConflictDoNothing();

  /* ── narration in the parent's own voice ────────────────────────────────── */
  const narrationText = PAGES.map((p) => p.text).join('\n');
  await db
    .insert(audioRenditions)
    .values({
      id: RENDITION_ID,
      storyId: STORY_ID,
      voiceKind: 'cloned',
      voiceProfileId: VOICE_PROFILE_ID,
      provider: 'mock',
      model: 'mock-tts-quality',
      tier: 'quality',
      status: 'succeeded',
      fullAssetId: seedId('asset:tts_full'),
      alignmentAssetId: seedId('asset:tts_alignment'),
      alignmentSource: 'provider',
      durationMs: 186_000,
      billedUnits: narrationText.length,
      billingUnit: 'character',
      costUsd: '0.18600',
      contentHash: sha256(`${narrationText}|${VOICE_PROFILE_ID}|quality|mock-tts-quality`),
      isDefault: true,
      createdAt: NOW,
      completedAt: NOW,
    })
    .onConflictDoNothing();

  const perPageMs = Math.floor(186_000 / PAGES.length);
  await db
    .insert(audioPageMarks)
    .values(
      PAGES.map((_, i) => ({
        id: seedId(`page_mark:${i + 1}`),
        renditionId: RENDITION_ID,
        pageId: seedId(`story_page:${i + 1}`),
        pageNo: i + 1,
        startMs: i * perPageMs,
        endMs: (i + 1) * perPageMs,
      })),
    )
    .onConflictDoNothing();

  /* ── the job that produced it, with a settled cost reservation ──────────── */
  await db
    .insert(jobs)
    .values({
      id: JOB_ID,
      userId: DEV_USER_ID,
      kind: 'story_fill',
      storyId: STORY_ID,
      status: 'succeeded',
      priority: 100,
      progressCurrent: 12,
      progressTotal: 12,
      progressLabel: '12/12 sayfa hazır',
      idempotencyKey: 'seed-story-fill-0001',
      requestHash: sha256(`story_fill:${STORY_ID}`),
      attempt: 1,
      estimatedCostUsd: '0.50000',
      actualCostUsd: '0.42100',
      reservationId: seedId('reservation:story_fill'),
      correlationId: '00000000000000000000000000000001',
      queuedAt: NOW,
      startedAt: NOW,
      finishedAt: NOW,
    })
    .onConflictDoNothing();

  await db
    .insert(jobSteps)
    .values(
      PAGES.map((_, i) => ({
        id: seedId(`job_step:page:${i + 1}`),
        jobId: JOB_ID,
        stepKey: `image:page:${String(i + 1).padStart(2, '0')}`,
        kind: 'image_page',
        status: 'succeeded',
        attempt: 1,
        inputHash: sha256(PAGES[i]!.prompt + STYLE_DNA_SUFFIX),
        provider: 'mock',
        providerModel: 'mock-image',
        // uuidv5 of the step id: the provider dedupes on this across our retries.
        providerRequestId: seedId(`provider_request:page:${i + 1}`),
        costUsd: '0.02000',
        startedAt: NOW,
        finishedAt: NOW,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(costReservations)
    .values({
      id: seedId('reservation:story_fill'),
      userId: DEV_USER_ID,
      jobId: JOB_ID,
      amountUsd: '0.50000',
      // Held during the job, committed when it succeeded — the happy path.
      state: 'committed',
      expiresAt: NOW,
      createdAt: NOW,
      settledAt: NOW,
    })
    .onConflictDoNothing();

  // `provider_usage` is an append-only ledger with a bigserial key and no natural unique
  // column — there is nothing to ON CONFLICT on. Clear this user's rows first so a second
  // `db:seed` does not double the recorded spend.
  await db.delete(providerUsage).where(eq(providerUsage.userId, DEV_USER_ID));
  await db.insert(providerUsage).values([
    {
      jobStepId: seedId('job_step:page:1'),
      userId: DEV_USER_ID,
      provider: 'mock',
      model: 'mock-image',
      operation: 'image.generate',
      billingUnit: 'image',
      billedUnits: '12.00',
      unitPriceUsd: '0.0200000000',
      costUsd: '0.24000',
      cacheHit: false,
      latencyMs: 4_200,
      createdAt: NOW,
    },
    {
      userId: DEV_USER_ID,
      provider: 'mock',
      model: 'mock-tts-quality',
      operation: 'tts.synth',
      billingUnit: 'character',
      billedUnits: String(narrationText.length),
      unitPriceUsd: '0.0000300000',
      costUsd: '0.18600',
      cacheHit: false,
      latencyMs: 8_100,
      createdAt: NOW,
    },
  ]);

  /* ── entitlement and credits ────────────────────────────────────────────── */
  await db
    .insert(entitlements)
    .values({
      userId: DEV_USER_ID,
      planCode: 'kredi_5',
      periodStart: NOW,
      periodEnd: PERIOD_END,
      storiesUsed: 1,
      creditsBalance: 4,
      periodCostUsd: '0.6070',
      reservedCostUsd: '0.0000',
      updatedAt: NOW,
    })
    .onConflictDoUpdate({
      target: entitlements.userId,
      set: { creditsBalance: 4, storiesUsed: 1, periodCostUsd: '0.6070' },
    });

  await db
    .insert(creditLedger)
    .values([
      {
        userId: DEV_USER_ID,
        delta: 5,
        reason: 'purchase',
        refType: 'plan',
        balanceAfter: 5,
        idempotencyKey: 'seed-credit-purchase-0001',
        createdAt: NOW,
      },
      {
        userId: DEV_USER_ID,
        delta: -1,
        reason: 'story_spend',
        refType: 'story',
        refId: STORY_ID,
        balanceAfter: 4,
        idempotencyKey: 'seed-credit-spend-0001',
        createdAt: NOW,
      },
    ])
    .onConflictDoNothing();

  /* ── a cache entry that already paid for itself ─────────────────────────── */
  const cachedPrompt = PAGES[0]!.prompt + STYLE_DNA_SUFFIX;
  await db
    .insert(contentCache)
    .values({
      cacheKey: sha256(`mock|mock-image|image.generate|2048x2048|${cachedPrompt}`),
      kind: 'image',
      assetId: seedId('asset:page:1'),
      payload: { width: 2048, height: 2048 },
      hitCount: 3,
      // Three hits × $0.02 avoided. Measured, not assumed.
      savedUsd: '0.06000',
      createdAt: NOW,
      lastHitAt: NOW,
    })
    .onConflictDoNothing();

  return {
    users: 1,
    children: 2,
    voiceProfiles: 1,
    voiceTakes: 3,
    stories: 1,
    storyPages: pageRows.length,
    audioRenditions: 1,
    audioPageMarks: PAGES.length,
    jobs: 1,
    jobSteps: PAGES.length,
    assets: assetRows.length,
  };
}
