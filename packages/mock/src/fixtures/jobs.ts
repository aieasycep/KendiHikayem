/**
 * jobs.ts — uzun iş fixture'ları ve İLERLEME METİNLERİ.
 *
 * ⭐ İlerleme YÜZDE DEĞİL, NE OLDUĞUDUR. Aşağıdaki metinler ekranda birebir görünür.
 * "%37" demek bekleme süresini uzatır; "Elif'in odası çiziliyor" demek bekleme
 * süresini değere çevirir (SPEC §11.0).
 */

import { jobSchema, type Job, type JobKind } from '@kendihikayem/contract';

import { IDS } from './ids';

export interface ProgressStep {
  labelTr: string;
  /** Bu adımın gerçek hayatta yaklaşık süresi (mock bunu hızlandırarak oynatır). */
  realMs: number;
}

/** İş türüne göre ilerleme senaryosu. SSE simülasyonu ve polling bunu oynatır. */
export const PROGRESS_SCRIPTS: Record<JobKind, ProgressStep[]> = {
  story_outline: [
    { labelTr: 'Fikriniz güvenlik kontrolünden geçiyor', realMs: 1_200 },
    { labelTr: 'Hikayenin ana fikri kuruluyor', realMs: 4_000 },
    { labelTr: '12 sahne sıraya diziliyor', realMs: 5_000 },
    { labelTr: 'Kahramanın üç farklı yüzü çiziliyor', realMs: 7_000 },
    { labelTr: 'Onayınız bekleniyor', realMs: 0 },
  ],
  story_fill: [
    { labelTr: 'Sayfa metinleri yazılıyor', realMs: 12_000 },
    { labelTr: 'Metinler yaş grubuna göre denetleniyor', realMs: 3_000 },
    { labelTr: 'Çizim stili hazırlanıyor', realMs: 6_000 },
    { labelTr: 'Kahramanın karakter sayfası kilitleniyor', realMs: 8_000 },
    { labelTr: 'Elif’in odası çiziliyor', realMs: 9_000 },
    { labelTr: 'Merdiven sahnesi çiziliyor', realMs: 9_000 },
    { labelTr: 'Tavan arası çiziliyor', realMs: 9_000 },
    { labelTr: 'Ateş böceği çiziliyor', realMs: 9_000 },
    { labelTr: 'Bahçedeki ışıklar çiziliyor', realMs: 9_000 },
    { labelTr: 'Kapak hazırlanıyor', realMs: 7_000 },
    { labelTr: 'Son rötuşlar yapılıyor', realMs: 3_000 },
  ],
  story_page_rewrite: [
    { labelTr: 'Sayfa yeniden yazılıyor', realMs: 5_000 },
    { labelTr: 'Yeni metin denetleniyor', realMs: 2_000 },
  ],
  voice_create: [
    { labelTr: 'Kayıtlarınız birleştiriliyor', realMs: 3_000 },
    { labelTr: 'Ses profiliniz oluşturuluyor', realMs: 15_000 },
    { labelTr: 'Elif için örnek cümle seslendiriliyor', realMs: 6_000 },
  ],
  voice_delete: [
    { labelTr: 'Ses modeliniz sağlayıcıdan siliniyor', realMs: 3_000 },
    { labelTr: 'Kayıtlarınız imha ediliyor', realMs: 2_000 },
    { labelTr: 'Hikayeler sistem sesine geçiriliyor', realMs: 2_000 },
  ],
  image_character_sheet: [
    { labelTr: 'Kahramanın yüzü çalışılıyor', realMs: 9_000 },
    { labelTr: 'Üç varyant hazırlanıyor', realMs: 12_000 },
  ],
  image_book: [
    { labelTr: 'Deniz feneri çiziliyor', realMs: 9_000 },
    { labelTr: 'İskele sahnesi çiziliyor', realMs: 9_000 },
    { labelTr: 'Fenerin içi çiziliyor', realMs: 9_000 },
    { labelTr: 'Kasabanın ışıkları çiziliyor', realMs: 9_000 },
  ],
  image_page: [{ labelTr: 'Bu sayfanın resmi yeniden çiziliyor', realMs: 9_000 }],
  audio_render: [
    { labelTr: 'Metin cümlelere ayrılıyor', realMs: 1_500 },
    { labelTr: 'İlk sayfalar seslendiriliyor', realMs: 12_000 },
    { labelTr: 'Son sayfalar seslendiriliyor', realMs: 12_000 },
    { labelTr: 'Ses parçaları birleştiriliyor', realMs: 4_000 },
    { labelTr: 'Kelime zamanlamaları hesaplanıyor', realMs: 6_000 },
  ],
  pdf_build: [
    { labelTr: 'Sayfalar baskı çözünürlüğünde yeniden üretiliyor', realMs: 40_000 },
    { labelTr: 'Kapak ve sırt hazırlanıyor', realMs: 8_000 },
    { labelTr: 'Baskı öncesi kontroller yapılıyor', realMs: 5_000 },
  ],
  print_submit: [
    { labelTr: 'Baskı dosyanız basımevine gönderiliyor', realMs: 4_000 },
    { labelTr: 'İş emri oluşturuluyor', realMs: 2_000 },
  ],
  export_mp4: [
    { labelTr: 'Sayfalar videoya diziliyor', realMs: 20_000 },
    { labelTr: 'Ses ve görüntü eşleniyor', realMs: 8_000 },
  ],
  privacy_export: [
    { labelTr: 'Verileriniz toplanıyor', realMs: 6_000 },
    { labelTr: 'İndirme paketi hazırlanıyor', realMs: 6_000 },
  ],
  privacy_delete: [
    { labelTr: 'Hesabınız kapatılıyor', realMs: 3_000 },
    { labelTr: 'Sağlayıcılardaki kayıtlar siliniyor', realMs: 5_000 },
    { labelTr: 'Silme kaydı oluşturuluyor', realMs: 2_000 },
  ],
};

/** Belirli bir adımda duran örnek iş üretir. */
export function makeJob(params: {
  id: string;
  kind: JobKind;
  stepIndex: number;
  status?: Job['status'];
  storyId?: string;
  voiceProfileId?: string;
  orderId?: string;
}): Job {
  const script = PROGRESS_SCRIPTS[params.kind];
  const index = Math.min(params.stepIndex, script.length - 1);
  const step = script[index]!;
  const status = params.status ?? (index >= script.length - 1 ? 'succeeded' : 'running');

  return jobSchema.parse({
    id: params.id,
    kind: params.kind,
    status,
    progress: { current: index + 1, total: script.length, labelTr: step.labelTr },
    etaMs: script.slice(index).reduce((total, item) => total + item.realMs, 0),
    storyId: params.storyId,
    voiceProfileId: params.voiceProfileId,
    orderId: params.orderId,
    steps: script.map((item, itemIndex) => ({
      stepKey: item.labelTr,
      status: itemIndex < index ? 'succeeded' : itemIndex === index ? 'running' : 'pending',
      attempt: 1,
    })),
    queuedAt: '2026-08-10T19:26:00Z',
    startedAt: '2026-08-10T19:26:02Z',
  });
}

/** ⏸ KAPI 1'de bekleyen iş — S09 ekranının tetikleyicisi. */
export const JOB_WAITING_APPROVAL: Job = jobSchema.parse({
  ...makeJob({
    id: IDS.jobOutline,
    kind: 'story_outline',
    stepIndex: 4,
    storyId: IDS.storyZeynepTaslak,
  }),
  status: 'waiting_approval',
  progress: {
    current: 5,
    total: 5,
    labelTr: 'İskelet hazır — onayınızı bekliyor',
  },
  finishedAt: '2026-08-10T19:26:18Z',
});

export const JOB_IMAGES_RUNNING: Job = makeJob({
  id: IDS.jobFill,
  kind: 'image_book',
  stepIndex: 1,
  storyId: IDS.storyAhmetDeniz,
});

export const JOB_VOICE_RUNNING: Job = makeJob({
  id: IDS.jobVoice,
  kind: 'voice_create',
  stepIndex: 1,
  voiceProfileId: IDS.voiceBaba,
});

export const JOBS: Job[] = [JOB_WAITING_APPROVAL, JOB_IMAGES_RUNNING, JOB_VOICE_RUNNING];
