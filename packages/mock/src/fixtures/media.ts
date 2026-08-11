/**
 * media.ts — sahte imzalı medya üreticileri.
 *
 * ── VARSAYILAN: MEDYA ÇALIŞIR ────────────────────────────────────────────────
 * URL'ler `https://demo.kendihikayem.com/...` altındadır. Bunlar gerçek bir
 * CDN'e işaret ETMEZ; mobil istemci bu adresleri APK'ya GÖMÜLÜ varlıklara
 * çevirir (apps/mobile/lib/demoMedia.ts). Böylece demo derlemesinde her sayfada
 * gerçekten bir görsel görünür ve ses gerçekten çalar — backend, internet ve AI
 * sağlayıcısı olmadan.
 *
 * ── HATA PROVASI: SENARYOYLA ─────────────────────────────────────────────────
 * Eskiden bu dosya HER ZAMAN 404 veren adresler döndürüyordu; amaç istemcinin
 * yer tutucu/hata yolunu her açılışta egzersiz ettirmekti. Bu yetenek KAYBOLMADI,
 * yalnızca varsayılan olmaktan çıktı: `medya_404` senaryosu açıldığında
 * `rewriteMediaForScenario` bütün medya adreslerini ölü CDN'e geri çevirir
 * (aşağıdaki `DEAD_CDN`). Gerçek üretimde de bir sayfanın görseli
 * `manual_review` kuyruğuna düşebilir ya da imzalı URL'in süresi dolabilir;
 * ekran buna hazır olmalıdır.
 */

import { signedMediaSchema, type SignedMedia } from '@kendihikayem/contract';

import { mockConfig } from '../scenarios';

/** Gömülü demo varlıklarının mantıksal tabanı. İstemci bunu yerel dosyaya çevirir. */
export const DEMO_MEDIA_BASE = 'https://demo.kendihikayem.com/demo';
/** Kasıtlı olarak çözülemeyen taban — `medya_404` senaryosunda kullanılır. */
export const DEAD_CDN = 'https://cdn.kendihikayem.com/mock';

/** Mock verisinin donmuş "şimdi"si. Testler ve ekran görüntüleri tekrarlanabilir olsun. */
export const MOCK_NOW = '2026-08-10T19:30:00Z';
export const MOCK_EXPIRES = '2026-08-11T19:30:00Z';

export function mockImage(path: string, width = 1024, height = 1024): SignedMedia {
  return signedMediaSchema.parse({
    url: `${DEMO_MEDIA_BASE}/img/${path}.webp`,
    mimeType: 'image/webp',
    expiresAt: MOCK_EXPIRES,
    sizeBytes: 180_000,
    width,
    height,
  });
}

/**
 * Ses. Demo derlemesinde gömülü MP3'e çözülür (bkz. demoMedia.ts).
 *
 * ⚠️ `durationMs` UYDURULAMAZ: oynatıcının karaoke zaman çizelgesi metinden
 * hesaplanıyor ve gömülü dosyalar TAM bu süreye göre üretildi. Buradaki değeri
 * değiştirirseniz `apps/mobile/assets/demo/generate_audio.py` içindeki hedef
 * süreyi de değiştirip sesi yeniden üretmeniz gerekir.
 */
export function mockAudio(path: string, durationMs: number): SignedMedia {
  return signedMediaSchema.parse({
    url: `${DEMO_MEDIA_BASE}/audio/${path}.mp3`,
    mimeType: 'audio/mpeg',
    expiresAt: MOCK_EXPIRES,
    sizeBytes: Math.round((durationMs / 1000) * 6_000),
    durationMs,
  });
}

/** PDF ve video için gömülü demo dosyası YOK; bu uçlar hâlâ ölü adres döner. */
export function mockPdf(path: string, sizeBytes = 4_200_000): SignedMedia {
  return signedMediaSchema.parse({
    url: `${DEAD_CDN}/pdf/${path}.pdf`,
    mimeType: 'application/pdf',
    expiresAt: MOCK_EXPIRES,
    sizeBytes,
  });
}

export function mockVideo(path: string, durationMs: number): SignedMedia {
  return signedMediaSchema.parse({
    url: `${DEAD_CDN}/video/${path}.mp4`,
    mimeType: 'video/mp4',
    expiresAt: MOCK_EXPIRES,
    durationMs,
    width: 1080,
    height: 1080,
  });
}

/**
 * `medya_404` senaryosunda yanıttaki bütün demo medya adreslerini ölü CDN'e
 * çevirir. Yanıt gövdesi üzerinde ÖZYİNELEMELİ çalışır: hangi ucun hangi
 * alanında medya olduğunu bilmek zorunda değiliz, sözleşme büyüdükçe de
 * çalışmaya devam eder.
 *
 * Senaryo kapalıyken gövde OLDUĞU GİBİ döner (yeni nesne bile üretilmez).
 */
export function rewriteMediaForScenario<T>(payload: T): T {
  if (mockConfig().scenario !== 'medya_404') return payload;
  return mapDemoUrls(payload) as T;
}

function mapDemoUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.startsWith(DEMO_MEDIA_BASE)
      ? `${DEAD_CDN}${value.slice(DEMO_MEDIA_BASE.length)}`
      : value;
  }
  if (Array.isArray(value)) return value.map(mapDemoUrls);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = mapDemoUrls(item);
    return out;
  }
  return value;
}

/** ISO zamanını dakika ekleyerek kaydırır (kuyruk/SLA fixture'ları için). */
export function shiftMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString().replace('.000Z', 'Z');
}
