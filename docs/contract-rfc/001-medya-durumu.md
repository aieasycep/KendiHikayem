# RFC 001 — Medya durumu alanları (sözleşme dondurulduktan sonra)

**Durum:** öneri · **Yazan:** demo-medya ajanı · **Tarih:** 2026-08-11
**Etkilenen:** `packages/contract` → `storyPageSchema`, `signedMediaSchema`

Demo medyası işi (`apps/mobile/assets/demo/**` + `packages/mock` bağlantısı)
sözleşmeye **hiçbir alan eklemeden** tamamlandı. Yani bu RFC bir engel raporu
değil; çalışırken görülen ve Faz 2'de gerçek üretim gelince canacak iki eksiğin
notudur.

---

## 1. `storyPage.imageAttempts` yok

`packages/db/src/schema/stories.ts` zaten `image_attempts` sütununu tutuyor ve
`apps/worker/src/flows/book.flow.ts` "denemesi biten kare `manual_review`'a
düşer, kitap yine çıkar" kuralını ona göre işletiyor. Ama sözleşmedeki
`storyPageSchema` yalnızca `imageStatus` taşıyor.

Sonuç: istemci `manual_review` sayfası için ancak **"Kontrolde"** yazabiliyor.
Ebeveynin gerçekten merak ettiği şey ise "ne kadar bekleyeceğim / bir sorun mu
var" — bunu ancak deneme sayısı ve son deneme zamanı ile söyleyebiliriz.

```ts
// öneri
imageAttempts: z.number().int().min(0).optional(),
imageLastAttemptAt: isoDateSchema.optional(),
```

Kırıcı değil (ikisi de `optional`). `apps/mobile/features/library/PagesSheet.tsx`
içindeki `imageNoteTr()` bunu doğrudan tüketebilir:
"2 deneme sonrası kontrolde — en geç yarın hazır".

## 2. `SignedMedia` medyanın **geçiciliğini** söyleyemiyor

Üretimde bir sayfanın görseli QA'yı geçemediğinde eldeki en iyi kare geçici
olarak gösterilebilir; kullanıcı bunun nihai olmadığını bilmeli. Sözleşmede
böyle bir işaret yok, yani "bu kare henüz kesin değil" bilgisi taşınamıyor.

```ts
// öneri
provisional: z.boolean().optional(), // true → kare değişebilir
```

Demo derlemesinde aynı ihtiyacı **istemci tarafında** çözdük: gömülü demo
görsellerinin köşesinde "DEMO" damgası var ve arayüz bunun demo olduğunu
söylüyor (`apps/mobile/lib/demoMedia.ts` → `DEMO_IMAGE_NOTE_TR`). Gerçek
üretimde bu bilgi sunucudan gelmeli, istemcinin adres deseninden tahmin etmesi
doğru değil.

---

## Şimdilik neden gerek yok

- Aşamalı teslim `imageStatus` ile zaten izlenebiliyor:
  `pending → generating → ready`, QA düşerse `manual_review`.
  Mock bunu zamana bağlı oynatıyor (`fixtures/story.ts` →
  `advanceGeneratingImages`), ekran da gösteriyor.
- Medyanın kırık olma durumu için yeni alan gerekmiyor: adres çözülemezse
  istemci zaten yer tutucuya düşüyor. Bu yol `medya_404` senaryosuyla prova
  edilebilir hâlde tutuldu.
