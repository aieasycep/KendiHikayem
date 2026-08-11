/**
 * demoMedia.ts — mock'un medya adreslerini APK'ya GÖMÜLÜ dosyalara bağlar.
 *
 * ── SORUN ────────────────────────────────────────────────────────────────────
 * Mock sunucusu (msw) yalnızca `fetch`/XHR'yi yakalar. Ama React Native'de
 * `<Image>` ve `expo-audio` ağa NATIVE katmandan çıkar; msw'nin oradan haberi
 * olmaz. Yani mock ne döndürürse döndürsün, adres gerçekten çözülemiyorsa
 * ekranda görsel çıkmaz ve ses çalmaz. Test kullanıcısının "görselleştirmeyi
 * göremedim, seslendirmeyi test edemedim" demesinin sebebi tam olarak buydu.
 *
 * ── ÇÖZÜM ────────────────────────────────────────────────────────────────────
 * Mock, medyayı `https://demo.kendihikayem.com/demo/...` altında adresler.
 * Burası o adresleri `require()` ile pakete giren dosyalara çevirir. Modül
 * NUMARASI döndürülür (URI string değil): `<Image source={number}>` ve
 * expo-audio'nun `AudioSource` tipi bunu her derleme türünde (dev/release)
 * güvenle çözer, imzalı URL / drawable adı tahmin etmeye gerek kalmaz.
 *
 * ── BUNLAR DEMO ──────────────────────────────────────────────────────────────
 * Görseller çizim değil, üretilmiş kompozisyonlardır (degrade + siluet + ışık;
 * köşelerinde "DEMO" damgası var). Ses ise KONUŞMA DEĞİL, enstrümantal bir
 * ninnidir — ebeveyn sesiyle seslendirme Faz 2'de gelecek. Arayüz bunu
 * kullanıcıya açıkça söyler (oynatıcıdaki rozet, Sesler ekranı, Ayarlar →
 * geliştirici bölümü). Üretim yolları için bkz. apps/mobile/assets/demo/*.py.
 *
 * Adres tanınmazsa `undefined` döner ve çağıran taraf normal davranışına
 * (uzak URL → yer tutucu) düşer; `medya_404` senaryosu bunu bilerek tetikler.
 */

import { registerLocalMediaResolver } from '@kendihikayem/ui';

/** packages/mock/src/fixtures/media.ts → DEMO_MEDIA_BASE ile birebir aynı olmalı. */
const DEMO_MEDIA_BASE = 'https://demo.kendihikayem.com/demo';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro varlıkları require ile paketler. */

/** `img/<anahtar>.webp` → gömülü dosya. Anahtarlar mock fixture yollarıdır. */
const IMAGES: Record<string, number> = {
  'story/elif/sayfa-1': require('../assets/demo/elif-sayfa-01.webp'),
  'story/elif/sayfa-2': require('../assets/demo/elif-sayfa-02.webp'),
  'story/elif/sayfa-3': require('../assets/demo/elif-sayfa-03.webp'),
  'story/elif/sayfa-4': require('../assets/demo/elif-sayfa-04.webp'),
  'story/elif/sayfa-5': require('../assets/demo/elif-sayfa-05.webp'),
  'story/elif/sayfa-6': require('../assets/demo/elif-sayfa-06.webp'),
  'story/elif/sayfa-7': require('../assets/demo/elif-sayfa-07.webp'),
  'story/elif/sayfa-8': require('../assets/demo/elif-sayfa-08.webp'),
  'story/elif/sayfa-9': require('../assets/demo/elif-sayfa-09.webp'),
  'story/elif/sayfa-10': require('../assets/demo/elif-sayfa-10.webp'),
  'story/elif/sayfa-11': require('../assets/demo/elif-sayfa-11.webp'),
  'story/elif/sayfa-12': require('../assets/demo/elif-sayfa-12.webp'),
  'story/elif/kapak': require('../assets/demo/elif-kapak.webp'),

  'story/ahmet/sayfa-1': require('../assets/demo/ahmet-sayfa-01.webp'),
  'story/ahmet/sayfa-2': require('../assets/demo/ahmet-sayfa-02.webp'),
  'story/ahmet/sayfa-3': require('../assets/demo/ahmet-sayfa-03.webp'),
  'story/ahmet/sayfa-4': require('../assets/demo/ahmet-sayfa-04.webp'),
  'story/ahmet/sayfa-5': require('../assets/demo/ahmet-sayfa-05.webp'),
  'story/ahmet/sayfa-6': require('../assets/demo/ahmet-sayfa-06.webp'),
  'story/ahmet/sayfa-7': require('../assets/demo/ahmet-sayfa-07.webp'),
  'story/ahmet/sayfa-8': require('../assets/demo/ahmet-sayfa-08.webp'),
  'story/ahmet/sayfa-9': require('../assets/demo/ahmet-sayfa-09.webp'),
  'story/ahmet/sayfa-10': require('../assets/demo/ahmet-sayfa-10.webp'),
  'story/ahmet/sayfa-11': require('../assets/demo/ahmet-sayfa-11.webp'),
  'story/ahmet/sayfa-12': require('../assets/demo/ahmet-sayfa-12.webp'),
  'story/ahmet/kapak': require('../assets/demo/ahmet-kapak.webp'),

  'story/deniz/sayfa-1': require('../assets/demo/deniz-sayfa-1.webp'),
  'story/deniz/sayfa-2': require('../assets/demo/deniz-sayfa-2.webp'),
  'story/deniz/sayfa-3': require('../assets/demo/deniz-sayfa-3.webp'),
  'story/deniz/sayfa-4': require('../assets/demo/deniz-sayfa-4.webp'),
  'story/deniz/sayfa-5': require('../assets/demo/deniz-sayfa-5.webp'),
  'story/deniz/sayfa-6': require('../assets/demo/deniz-sayfa-6.webp'),
  'story/deniz/sayfa-7': require('../assets/demo/deniz-sayfa-7.webp'),
  'story/deniz/sayfa-8': require('../assets/demo/deniz-sayfa-8.webp'),
  'story/deniz/kapak': require('../assets/demo/deniz-kapak.webp'),

  'character/elif-sheet': require('../assets/demo/karakter-elif-sheet.webp'),
  'character/elif-v1': require('../assets/demo/karakter-elif-v1.webp'),
  'character/elif-v2': require('../assets/demo/karakter-elif-v2.webp'),
  'character/elif-v3': require('../assets/demo/karakter-elif-v3.webp'),
  'character/findik-sheet': require('../assets/demo/karakter-findik-sheet.webp'),
  'character/ahmet-sheet': require('../assets/demo/karakter-ahmet-sheet.webp'),
  'character/deniz-sheet': require('../assets/demo/karakter-deniz-sheet.webp'),
  'character/zeynep-v1': require('../assets/demo/karakter-zeynep-v1.webp'),
  'character/zeynep-v2': require('../assets/demo/karakter-zeynep-v2.webp'),
  'character/zeynep-v3': require('../assets/demo/karakter-zeynep-v3.webp'),

  'style/suluboya': require('../assets/demo/stil-suluboya.webp'),
  'style/pastel': require('../assets/demo/stil-pastel.webp'),
  'style/kesik-kagit': require('../assets/demo/stil-kesik-kagit.webp'),
  'style/cizgi-defter': require('../assets/demo/stil-cizgi-defter.webp'),
  'style/anadolu': require('../assets/demo/stil-anadolu.webp'),

  'format/kare21': require('../assets/demo/format-kare21-sert.webp'),
  'format/kare21-yumusak': require('../assets/demo/format-kare21-yumusak.webp'),
};

/**
 * `audio/<anahtar>.mp3` → gömülü dosya.
 *
 * Tek bir masal parçası iki seslendirmeye de hizmet eder: demo müziği ikisinde
 * de aynıdır, ayrım Faz 2'de gerçek seslerle gelir. Süreler fixture'daki
 * `durationMs` ile eşleşir (karaoke senkronu buna bağlı).
 */
const AUDIO: Record<string, number> = {
  'story/elif/anne': require('../assets/demo/ninni-masal.mp3'),
  'story/elif/sistem': require('../assets/demo/ninni-masal.mp3'),
  'story/elif/anne-sayfa-6': require('../assets/demo/ninni-sayfa-06.mp3'),

  'voice/anne-onizleme': require('../assets/demo/ninni-ornek-sicak.mp3'),
  'voice/baba-onizleme': require('../assets/demo/ninni-ornek-parlak.mp3'),
  'voice/deniz': require('../assets/demo/ninni-ornek-sicak.mp3'),
  'voice/kerem': require('../assets/demo/ninni-ornek-parlak.mp3'),
  'voice/nur': require('../assets/demo/ninni-ornek-sicak.mp3'),
  'voice/ege': require('../assets/demo/ninni-ornek-parlak.mp3'),
};

/* eslint-enable @typescript-eslint/no-require-imports */

function keyFrom(uri: string, kind: 'img' | 'audio', extension: string): string | undefined {
  const prefix = `${DEMO_MEDIA_BASE}/${kind}/`;
  if (!uri.startsWith(prefix) || !uri.endsWith(extension)) return undefined;
  return uri.slice(prefix.length, uri.length - extension.length);
}

/** Görsel adresi gömülü dosyaya çevirir. Tanınmazsa undefined. */
export function demoImageModule(uri: string | undefined): number | undefined {
  if (uri === undefined) return undefined;
  const key = keyFrom(uri, 'img', '.webp');
  return key === undefined ? undefined : IMAGES[key];
}

/** Ses adresini gömülü dosyaya çevirir. Tanınmazsa undefined. */
export function demoAudioModule(uri: string | undefined): number | undefined {
  if (uri === undefined) return undefined;
  const key = keyFrom(uri, 'audio', '.mp3');
  return key === undefined ? undefined : AUDIO[key];
}

/** Ses gerçekten gömülü demo müziği mi — arayüzdeki dürüstlük rozetleri buna bakar. */
export function isDemoAudio(uri: string | undefined): boolean {
  return demoAudioModule(uri) !== undefined;
}

/**
 * `useAudioPlayer` için hazır kaynak: gömülü demo dosyası varsa modül numarası,
 * yoksa uzak adres, adres de yoksa `null` (oynatıcı boş kurulur).
 *
 * Kaynağın `useMemo` ile sarılması ÖNEMLİDİR — her render'da yeni nesne dönerse
 * expo-audio çalanı baştan yükler.
 */
export function demoAudioSource(uri: string | undefined): number | { uri: string } | null {
  const bundled = demoAudioModule(uri);
  if (bundled !== undefined) return bundled;
  return uri !== undefined && uri.length > 0 ? { uri } : null;
}

/** Oynatıcıda ve Sesler ekranında gösterilen açıklama. Tek yerden okunur. */
export const DEMO_AUDIO_NOTE_TR =
  'Bu demo derlemesinde seslendirme yerine enstrümantal bir ninni çalıyor. ' +
  'Ebeveyn sesiyle gerçek seslendirme Faz 2’de gelecek.';

export const DEMO_IMAGE_NOTE_TR =
  'Sayfa görselleri demo kompozisyonlarıdır (köşelerinde “DEMO” damgası var). ' +
  'Gerçek illüstrasyonlar Faz 2’de üretilecek.';

/**
 * `MediaImage` gibi paket bileşenlerinin de gömülü varlığı bulabilmesi için
 * çözücüyü tasarım sistemine kaydeder. Modül yüklendiği anda çalışır; çağıranın
 * (lib/mock.ts) uygulamanın ilk render'ından ÖNCE import etmesi yeterlidir.
 */
registerLocalMediaResolver((uri) => demoImageModule(uri));
