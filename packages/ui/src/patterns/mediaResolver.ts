/**
 * mediaResolver.ts — "bu adres aslında pakette gömülü" kancası.
 *
 * NEDEN VAR
 * Demo derlemesi backend'siz çalışır: mock, medya adreslerini
 * `https://demo.kendihikayem.com/...` altında üretir ve bu adreslerin ARKASINDA
 * bir sunucu YOKTUR. Uygulama onları APK'ya gömülü varlıklara çevirir. Ama bu
 * çeviriyi `packages/ui` yapamaz — gömülü varlıklar uygulamanın içindedir ve
 * SPEC §3 sınırları paketin uygulamaya bakmasını yasaklar.
 *
 * Çözüm: uygulama açılışta bir çözücü KAYDEDER, `MediaImage` her render'da onu
 * sorar. Kayıt yoksa davranış hiç değişmez (uzak URL denenir, olmazsa yer
 * tutucu) — yani canlı API modunda ve web'de bu dosya görünmezdir.
 *
 * Çözücü SAF ve SENKRON olmalıdır: render sırasında çağrılır.
 */

/** `require('...')` sonucu olan modül numarasını döndürür; bilmiyorsa undefined. */
export type LocalMediaResolver = (uri: string) => number | undefined;

let resolver: LocalMediaResolver | undefined;

/** Uygulama açılışında bir kez çağrılır. `undefined` vermek kaydı siler. */
export function registerLocalMediaResolver(next: LocalMediaResolver | undefined): void {
  resolver = next;
}

/** Kayıtlı çözücüye sorar. Kayıt yoksa ya da adres tanınmıyorsa undefined. */
export function resolveLocalMedia(uri: string | undefined): number | undefined {
  if (uri === undefined || uri.length === 0 || resolver === undefined) return undefined;
  return resolver(uri);
}
