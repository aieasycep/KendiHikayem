# RFC 002 — `audio_renditions` silme zincirini bloke ediyor

**Durum:** açık · **Öneren:** A5 (ses hattı) · **Etkilenen:** `packages/db/src/schema/audio.ts`
**Öncelik:** P1 — hesap silme (KVKK m.7) bu hâliyle başarısız oluyor.

## Sorun

`audio_renditions` iki kuralı aynı anda taşıyor ve bunlar çelişiyor:

```ts
voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, {
  onDelete: 'set null',      // ① ses profili silinince hikaye silinmesin
}),

check(
  'audio_renditions_voice_ref_check',
  sql`(${t.voiceKind} = 'cloned' and ${t.voiceProfileId} is not null)
   or (${t.voiceKind} = 'system' and ${t.systemVoiceCode} is not null)`,  // ②
),
```

① `voice_profiles` satırı silindiğinde `voice_profile_id`'yi `NULL` yapar.
② `voice_kind = 'cloned'` olan bir satırda `voice_profile_id`'nin `NULL` olmasını yasaklar.

Yani **klonlanmış sesle seslendirilmiş en az bir hikayesi olan bir kullanıcının ses profili
satırı hiçbir zaman gerçekten silinemez.** Postgres, cascade sırasında CHECK'i ihlal eder:

```
PostgresError: new row for relation "audio_renditions" violates check constraint
"audio_renditions_voice_ref_check"
where: SQL statement "UPDATE ONLY "public"."audio_renditions"
       SET "voice_profile_id" = NULL WHERE $1 = "voice_profile_id""
```

`users` → `voice_profiles` ilişkisi `ON DELETE CASCADE` olduğu için aynı hata
**hesabın tamamen silinmesini de** engeller (`delete from users` başarısız olur).
Bu, KVKK m.7 / m.11 kapsamındaki silme talebinin teknik olarak yerine getirilememesi demektir.

Üretilebilir kanıt: `apps/worker/test/audio.integration.test.ts` teardown'ı; klonlanmış
rendition'ı önce silmezse aynı hatayı verir (testte yorumla işaretlendi).

## Şu anki geçici çözüm (A5)

`processors/audio-deletion.ts` ses profilini **hard-delete etmiyor**: `deleted_at` +
`status='revoked'` ile yumuşak siliyor, ilgili rendition'ları `status='stale'`,
`is_default=false` yapıyor ve rendition ses dosyalarını `deletion_tasks` ile imha ediyor.
Böylece FK hedefi ayakta kaldığı için CHECK ihlal edilmiyor ve SPEC §7 adım 11'in
"hikayeler silinmez, sistem sesine döner" davranışı sağlanıyor.

Bu, ses profili silme için yeterli; **hesap silme için değil** (A1'in `privacy.delete` işi
aynı duvara çarpacak).

## Öneri

Üç seçenek, tercih sırasıyla:

**(A) CHECK'i gevşet — önerilen.** `cloned` bir rendition'ın profili gitmişse `voice_label`
zaten `audio_renditions` dışında tutuluyor; kısıtı şu hâle getir:

```sql
(voice_kind = 'cloned')                                   -- profil NULL olabilir
or (voice_kind = 'system' and system_voice_code is not null)
```

Kaybedilen garanti küçük (bir `cloned` rendition'ın hangi profile ait olduğu), kazanılan
şey silme zincirinin çalışması. Manifest zaten `voiceLabel`'ı ayrı taşıyor.

**(B) `ON DELETE` davranışını değiştir.** `set null` yerine `restrict` + uygulama
katmanında rendition'ları önce sil. Silme mantığını iki yere dağıtır; cascade'in amacı
buydu, geri alınmış olur.

**(C) Yeni sütun.** `voice_profile_deleted boolean` + CHECK'i ona bağla. Şema büyür,
sorunu çözmez, sadece erteler.

## Karar bekleyen

A2 (şema sahibi) ve A1 (KVKK/hesap silme) onayı. Karar verilene kadar A5'in yumuşak silme
yaklaşımı yürürlükte; hesap silme akışı yazılmadan önce bu çözülmeli.
