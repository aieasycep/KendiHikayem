/**
 * scenarios.ts — mock davranışını çalışma anında ayarlama.
 *
 * FE ajanlarının "boş / yükleniyor / hata / kısmi" durumlarının hepsini
 * görebilmesi için mock'un tek bir mutlu yolu yoktur. Senaryoyu değiştirmek
 * uygulamayı yeniden derlemeyi gerektirmez:
 *
 * ```ts
 * import { configureMock } from '@kendihikayem/mock';
 * configureMock({ scenario: 'kredi_yok', latencyMs: [400, 900] });
 * ```
 */

export type MockScenario =
  /** Her şey yolunda. Varsayılan. */
  | 'mutlu_yol'
  /** Kredi yetmiyor: üretim uçları 402 döner. */
  | 'kredi_yok'
  /** Ses rızaları verilmemiş: ses uçları 403 CONSENT_REQUIRED döner. */
  | 'riza_yok'
  /** Sağlayıcı arızası: uzun işler başarısızlıkla biter. */
  | 'saglayici_arizasi'
  /** Kayıt ortamı gürültülü: her take reddedilir. */
  | 'gurultulu_kayit'
  /** Aylık üretim bütçesi doldu: iş HİÇ başlamaz. */
  | 'maliyet_tavani'
  /** Ağ yavaş ve kararsız: rastgele 503'ler. */
  | 'kararsiz_ag'
  /**
   * Medya çözülemiyor: bütün görsel/ses adresleri ölü CDN'e çevrilir.
   *
   * Üretimde bunun karşılığı gerçektir — imzalı URL'in süresi dolar, sayfa
   * `manual_review` kuyruğunda bekler ya da CDN bölgesi düşer. Demo derlemesi
   * varsayılan olarak gömülü medyayı gösterdiği için bu yol artık kendiliğinden
   * egzersiz edilmiyor; senaryoyu açan kişi kırık durumu ISTEYEREK prova eder:
   * kapak yer tutucusu, sayfa monogramı, oynatıcının "sessiz okuma" düşüşü.
   */
  | 'medya_404';

export interface MockConfig {
  /** Sabit gecikme ya da [min, max] aralığı (ms). */
  latencyMs: number | [number, number];
  /** 0..1 — istek başına rastgele 503 olasılığı (kararsiz_ag senaryosunda artar). */
  errorRate: number;
  /**
   * Yazma uçlarında `Idempotency-Key` ve her uçta `x-client-version` başlığı
   * yoksa hata döndür. VARSAYILAN AÇIK: eksik başlık üretimde 400 demektir,
   * mock'un bunu gizlemesi FE'yi geç kalmış bir hataya sürükler.
   */
  strictHeaders: boolean;
  /** Uzun işlerin hızlandırma katsayısı. 10 = gerçek süresinin onda biri. */
  jobSpeed: number;
  scenario: MockScenario;
  /** SSE akışı açık mı (kapalıysa istemci polling'e düşmek zorunda kalır). */
  sseEnabled: boolean;
}

const DEFAULT_CONFIG: MockConfig = {
  latencyMs: [120, 380],
  errorRate: 0,
  strictHeaders: true,
  jobSpeed: 12,
  scenario: 'mutlu_yol',
  sseEnabled: true,
};

let config: MockConfig = { ...DEFAULT_CONFIG };

export function mockConfig(): Readonly<MockConfig> {
  return config;
}

export function configureMock(partial: Partial<MockConfig>): void {
  config = { ...config, ...partial };
}

export function resetMockConfig(): void {
  config = { ...DEFAULT_CONFIG };
}

/** Deterministik olmayan tek yer; testlerde `latencyMs: 0` verin. */
export function nextLatencyMs(): number {
  const { latencyMs } = config;
  if (typeof latencyMs === 'number') return latencyMs;
  const [min, max] = latencyMs;
  return Math.round(min + Math.random() * (max - min));
}

export function shouldInjectNetworkError(): boolean {
  const rate = config.scenario === 'kararsiz_ag' ? Math.max(config.errorRate, 0.25) : config.errorRate;
  return rate > 0 && Math.random() < rate;
}
