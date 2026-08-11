/**
 * ids.ts — deterministik sahte kimlikler.
 *
 * Mock verisi HER ÇALIŞTIRMADA AYNI olmalıdır: ekran görüntüsü diff'i, Playwright
 * senaryosu ve hata raporu ancak böyle tekrarlanabilir. `crypto.randomUUID()`
 * kullanılmaz; sayaçtan üretilen geçerli v4 biçimli değerler kullanılır.
 */

/** `00000000-0000-4000-8000-<12 hane>` — zod `.uuid()` doğrulamasını geçer. */
export function mockUuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString().padStart(12, '0')}`;
}

let counter = 1000;
/** Çalışma sırasında üretilen yeni kayıtlar için (POST sonrası). */
export function nextMockUuid(): string {
  counter += 1;
  return mockUuid(counter);
}

export const IDS = {
  user: mockUuid(1),
  guestUser: mockUuid(2),

  childElif: mockUuid(11),
  childAhmet: mockUuid(12),
  childZeynep: mockUuid(13),

  storyElifIsik: mockUuid(21),
  storyAhmetDeniz: mockUuid(22),
  storyZeynepTaslak: mockUuid(23),

  characterElif: mockUuid(31),
  characterFindik: mockUuid(32),

  voiceAnne: mockUuid(41),
  voiceBaba: mockUuid(42),
  voiceScript: mockUuid(43),

  renditionAnne: mockUuid(51),
  renditionSistem: mockUuid(52),

  jobOutline: mockUuid(61),
  jobFill: mockUuid(62),
  jobVoice: mockUuid(63),
  jobAudio: mockUuid(64),
  jobBook: mockUuid(65),

  bookBuild: mockUuid(71),
  order: mockUuid(72),
  exportPdf: mockUuid(73),

  legalAydinlatmaSes: mockUuid(81),
  legalRizaSes: mockUuid(82),
  legalRizaYurtdisi: mockUuid(83),
  legalMesafeliSatis: mockUuid(84),
  legalCayma: mockUuid(85),

  privacyRequest: mockUuid(91),
  report: mockUuid(92),
  asset: mockUuid(93),
} as const;

/** Sayfa kimlikleri 1..16 sayfa için sabit. */
export function storyPageId(storyId: string, pageNo: number): string {
  const base = Number.parseInt(storyId.slice(-12), 10);
  return mockUuid(base * 100 + pageNo);
}
