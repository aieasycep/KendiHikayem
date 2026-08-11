/**
 * voice.ts — ses onboarding fixture'ları.
 *
 * PASAJ METİNLERİ ÜRÜNÜN KALİTESİNİ BELİRLER (SPEC §7 adım 6): kullanıcı bu
 * metinleri nasıl okursa klonlanan ses öyle konuşur. Bu yüzden metinler MASAL
 * TONUNDA yazıldı, haber metni gibi değil; `ğ ı ö ü ş ç` yoğun, yumuşak g'li
 * kelimeler (yağmur, doğa, ağaç), uzun ekli sözcükler ve gerçek diyalog içerir.
 */

import {
  submitTakeResSchema,
  voiceProfileSchema,
  voiceScriptBundleSchema,
  type SubmitTakeRes,
  type VoiceProfile,
  type VoiceScriptBundle,
} from '@kendihikayem/contract';

import { IDS } from './ids';
import { mockAudio } from './media';

export const VOICE_GUIDANCE_TR = [
  'Sessiz bir oda seçin; televizyonu ve klimayı kapatın.',
  'Telefonu ağzınızdan yaklaşık 20 cm uzakta tutun.',
  'Kulaklık takmayın; telefonun kendi mikrofonu daha iyi sonuç verir.',
  'Masal anlatır gibi okuyun — haber sunar gibi değil.',
  'Yanlış okursanız durmayın, pasajı bitirip yeniden kaydedin.',
];

export const VOICE_SCRIPT: VoiceScriptBundle = voiceScriptBundleSchema.parse({
  scriptId: IDS.voiceScript,
  expiresAt: '2026-08-10T19:45:00Z',
  consentClip: {
    step: 'consent_clip',
    randomSentenceTr: 'Mavi bardağın içinde yedi tane sarı düğme duruyor.',
    consentStatementTr:
      'Ben Ayşe Yılmaz, sesimin KendiHikayem uygulamasında çocuğuma özel masalları seslendirmek amacıyla işlenmesine ve bu amaçla yurt dışına aktarılmasına açık rıza veriyorum.',
    targetSec: 12,
  },
  totalTargetSec: 110,
  guidanceTr: VOICE_GUIDANCE_TR,
  passages: [
    {
      step: 'passage_1',
      titleTr: 'Sakin anlatım',
      toneHintTr: 'Uyku öncesi tonu. Yavaş, yumuşak, cümle sonlarında kısa duraklayın.',
      bodyTr:
        'Yağmur, çatının üstünde usul usul yürüyordu. Değirmenin arkasındaki söğüt ağacı, ıslanan dallarını ağır ağır salladı. Dağların ardından çıkan ay, bahçedeki bütün gölgeleri yumuşacık örttü. Küçük ırmağın şırıltısı, uykuya çağıran bir ninniye benziyordu. Sıcacık yorganın altında, bütün gün koşturmuş ayaklar dinleniyordu artık. Göz kapakları ağırlaştıkça ağırlaşıyor, rüyaların kapısı usulca aralanıyordu. Uzaktaki çatıdan bir baykuş iki kez seslendi ve sonra sustu. Bahçedeki ıhlamur ağacı, yağmurun son damlalarını yapraklarından yavaşça süzdü.',
      targetSec: 28,
    },
    {
      step: 'passage_2',
      titleTr: 'Heyecanlı',
      toneHintTr: 'Yüksek enerji. Sesinizi yükseltmeden hızlanın, ünlemleri gerçekten yaşayın.',
      bodyTr:
        'Birden bahçe kapısı çarptı! Rüzgâr yaprakları havalandırdı, hepsini fırıl fırıl döndürdü. "Çabuk olun, yetişemeyeceğiz!" diye bağırdı biri. Ayaklar toprağa vurdu, çakıl taşları sağa sola sıçradı, kalpler güm güm attı. Tepeye ilk kim çıkacaktı? Yokuşun sonunda ışıl ışıl parlayan o şey de neydi öyle? Herkes aynı anda durdu, gözler kocaman açıldı ve kalabalıktan koca bir uğultu yükseldi. Önce kimse ilerlemeye cesaret edemedi. Sonra en küçükleri bir çığlık atıp doğruca oraya koştu!',
      targetSec: 28,
    },
    {
      step: 'passage_3',
      titleTr: 'Fısıltıya yakın',
      toneHintTr: 'Neredeyse fısıltı. Mikrofona yaklaşmayın, sadece sesinizi yumuşatın.',
      bodyTr:
        'Şşşt... Duyuyor musun? Şu ağacın kovuğunda küçücük bir şey kıpırdıyor. Sakın koşma, sakın seslenme; usulca yaklaş ve nefesini tut. Tüyleri yumuşacık, gagası bir yağmur damlası kadar küçük. Annesini arıyor olmalı, öyle değil mi? Onu ürkütmeyelim. Parmağının ucuyla, sanki bir bulutu okşuyormuşsun gibi dokun. İşte böyle... Bak, gözlerini kapattı bile. Şimdi sen de usulca geri çekil; bu akşam onu annesi bulacak. Uykusu, ıslak toprağın kokusuyla daha da derinleşecek.',
      targetSec: 27,
    },
    {
      step: 'passage_4',
      titleTr: 'Diyalog, soru ve ünlem',
      toneHintTr: 'İki farklı karakter. Yaşlı çınar kalın ve ağır, çocuk canlı ve meraklı.',
      bodyTr:
        '"Sen kimsin bakayım?" diye sordu ihtiyar çınar. "Ben mi? Ben buraların en meraklı çocuğuyum!" "Peki neden bu kadar geciktin?" "Çünkü yolda bir kirpiyle tanıştım, hâlini hatırını sordum." Çınar güldü, bütün dalları birden hışırdadı: "Aferin sana!" dedi. "Şimdi söyle bakalım, doğru yolu kendi başına bulabilecek misin?" Çocuk gülümsedi: "Elbette bulurum! Yeter ki sen bana bir dalını uzat." İhtiyar çınar en uzun dalını eğdi ve fısıldadı: "Yolun açık olsun küçük yolcu."',
      targetSec: 27,
    },
  ],
});

/* ── Profiller ───────────────────────────────────────────────── */

export const VOICE_PROFILE_ANNE: VoiceProfile = voiceProfileSchema.parse({
  id: IDS.voiceAnne,
  displayName: 'Anne',
  relation: 'anne',
  status: 'ready',
  qualityScore: 0.91,
  qualityBadge: 'mukemmel',
  preview: mockAudio('voice/anne-onizleme', 15_000),
  storiesUsingCount: 4,
  createdAt: '2026-08-03T20:14:00Z',
  acceptedAt: '2026-08-03T20:22:00Z',
});

/** V08 ekranı: önizleme hazır, kullanıcı henüz onaylamadı. */
export const VOICE_PROFILE_BABA: VoiceProfile = voiceProfileSchema.parse({
  id: IDS.voiceBaba,
  displayName: 'Baba',
  relation: 'baba',
  status: 'preview_ready',
  qualityScore: 0.78,
  qualityBadge: 'iyi',
  preview: mockAudio('voice/baba-onizleme', 15_000),
  storiesUsingCount: 0,
  createdAt: '2026-08-10T19:20:00Z',
});

export const VOICE_PROFILES: VoiceProfile[] = [VOICE_PROFILE_ANNE, VOICE_PROFILE_BABA];

/* ── Take yanıtları ──────────────────────────────────────────── */

export const TAKE_ACCEPTED: SubmitTakeRes = submitTakeResSchema.parse({
  accepted: true,
  quality: {
    snrDb: 27.4,
    peakDbfs: -8.2,
    clippingPct: 0,
    silenceRatio: 0.18,
    wordsPerMinute: 142,
    bandwidthHz: 11_200,
    reverbMs: 210,
    asrSimilarity: 0.97,
    speakerCount: 1,
    durationMs: 27_400,
    score: 0.91,
  },
  issues: [],
  guidanceTr: 'Harika okudunuz. Bir sonraki pasaja geçebilirsiniz.',
  canRetry: true,
  attemptsLeft: 4,
  progress: {
    completedSteps: ['consent_clip', 'passage_1'],
    nextStep: 'passage_2',
    capturedSec: 39,
    targetSec: 110,
  },
});

export const TAKE_NOISY: SubmitTakeRes = submitTakeResSchema.parse({
  accepted: false,
  quality: {
    snrDb: 12.1,
    peakDbfs: -14.5,
    clippingPct: 0,
    silenceRatio: 0.22,
    wordsPerMinute: 138,
    bandwidthHz: 9_400,
    reverbMs: 260,
    asrSimilarity: 0.94,
    speakerCount: 1,
    durationMs: 26_900,
    score: 0.41,
  },
  issues: ['GURULTULU'],
  guidanceTr: 'Arka planda gürültü var. Televizyon veya klima varsa kapatıp yeniden okuyun.',
  canRetry: true,
  attemptsLeft: 3,
  progress: {
    completedSteps: ['consent_clip'],
    nextStep: 'passage_1',
    capturedSec: 12,
    targetSec: 110,
  },
});

export const TAKE_TOO_FAST: SubmitTakeRes = submitTakeResSchema.parse({
  accepted: false,
  quality: {
    snrDb: 24.8,
    peakDbfs: -9.1,
    clippingPct: 0.02,
    silenceRatio: 0.11,
    wordsPerMinute: 197,
    bandwidthHz: 11_000,
    reverbMs: 180,
    asrSimilarity: 0.96,
    speakerCount: 1,
    durationMs: 19_800,
    score: 0.52,
  },
  issues: ['COK_HIZLI'],
  guidanceTr: 'Biraz daha yavaş okuyun; masal anlatır gibi, cümle sonlarında kısa duraklayın.',
  canRetry: true,
  attemptsLeft: 2,
  progress: {
    completedSteps: ['consent_clip', 'passage_1'],
    nextStep: 'passage_2',
    capturedSec: 39,
    targetSec: 110,
  },
});

export const TAKE_MISMATCH: SubmitTakeRes = submitTakeResSchema.parse({
  accepted: false,
  quality: {
    snrDb: 26.0,
    peakDbfs: -8.8,
    clippingPct: 0,
    silenceRatio: 0.2,
    wordsPerMinute: 131,
    bandwidthHz: 10_800,
    reverbMs: 200,
    asrSimilarity: 0.62,
    speakerCount: 1,
    durationMs: 11_200,
    score: 0.38,
  },
  issues: ['METIN_ESLESMEDI'],
  guidanceTr: 'Okuduklarınız ekrandaki metinle tam eşleşmedi. Metni satır satır takip ederek yeniden okuyun.',
  canRetry: true,
  attemptsLeft: 4,
  progress: {
    completedSteps: [],
    nextStep: 'consent_clip',
    capturedSec: 0,
    targetSec: 110,
  },
});

/** Adım kimliğine göre sıradaki gerçekçi yanıt (senaryo motoru bunu kullanır). */
export const TAKE_RESPONSES = {
  kabul: TAKE_ACCEPTED,
  gurultulu: TAKE_NOISY,
  hizli: TAKE_TOO_FAST,
  eslesmedi: TAKE_MISMATCH,
} as const;
