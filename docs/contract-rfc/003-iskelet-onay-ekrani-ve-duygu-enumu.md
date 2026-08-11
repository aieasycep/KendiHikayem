# RFC 003 — İskelet onay ekranının eksik alanları + `emotion` enum uyuşmazlığı

**Durum:** öneri · **Yazan:** A3 (hikaye & güvenlik) · **Tarih:** 2026-08-11
**Etkilenen:** `packages/contract` → `storyOutlineSchema`, `storyCharacterSchema`,
`storyPageSchema.emotion`

İki aşamalı üretim (`packages/providers/llm` + `apps/worker/src/processors/story*`)
sözleşmeye **hiç alan eklemeden** çalışıyor: iskelet, KAPI 1, dolgu, kalite kapısı ve
moderasyon uçtan uca yeşil (`apps/worker/test/story.integration.test.ts`). Aşağıdaki iki
madde bir engel değil, **ekranın veriyi sözleşme üzerinden alamadığı** iki nokta. İkisi de
eklemeli (minor) çözülebilir.

---

## 1. KAPI 1 ekranı, karakter varyantlarını ve kapak fikrini sözleşmeden alamıyor

Aşama 1'in ürünü şu: 12 sahne özeti **+ 3 karakter varyantı + kapak fikri** — ebeveyn bunu
5 saniyede onaylıyor ve pahalı aşama ancak ondan sonra çalışıyor.

Sözleşmede:

- `storyOutlineSchema` yalnızca `{ titleTr, lessonTr, scenes[] }` taşıyor. Kapak fikri için
  yer yok.
- Varyantlar `storyCharacterSchema.variants[]` içinde duruyor, ama orada
  `image: signedMediaSchema` **zorunlu**. KAPI 1'de henüz hiçbir görsel üretilmemiştir
  (üretilmiş olsa aşamanın ucuz olma sebebi kalmaz), yani bu dizi doldurulamıyor.

Sonuç: iskelet onay ekranı ya varyantları hiç gösteremiyor ya da API sözleşme dışı bir
alan uydurmak zorunda kalıyor. Şu an veriler `story_characters.sheet_variants` (JSONB) ve
`stories.outline` içinde duruyor; DB tarafında eksik yok.

```ts
// öneri — storyOutlineSchema'ya eklemeli
coverIdea: z
  .object({ summaryTr: z.string().min(1), promptEn: z.string().min(1) })
  .optional(),

// öneri — varyantın görselden ÖNCEKİ hâli
variants: z
  .array(
    z.object({
      id: z.string().min(1),
      /** Görsel üretilmeden önce ebeveyne gösterilecek tek cümlelik fark. */
      summaryTr: z.string().optional(),
      /** ⚠️ artık optional: KAPI 1'de görsel yoktur. */
      image: signedMediaSchema.optional(),
      selected: z.boolean().default(false),
    }),
  )
  .optional(),
```

`image` alanını `optional` yapmak teknik olarak kırıcı bir gevşetmedir (istemci artık
`image`'ın varlığını kontrol etmek zorunda), bu yüzden karar A0'ın: ya bu gevşetme, ya da
`outline` içinde ayrı bir `characterVariantIdeas[]` alanı.

## 2. `emotion` sözleşmede serbest metin, veritabanında 6 değerlik CHECK

`packages/db/src/schema/types.ts`:

```ts
export const PAGE_EMOTION = ['sakin','nese','merak','hafif_endise','cozulme','sicak_kapanis'];
```

`story_pages.emotion` bu listeyle CHECK'lidir. Sözleşmede ise
`storyPageSchema.emotion: z.string().optional()` — serbest.

Bunun iki somut sonucu var:

1. **Üretim tarafı zaten kısıtlı yazıyor** (`apps/worker/src/prompts/outline.ts` şemayı
   `PAGE_EMOTION`'dan üretiyor), ama bunu sözleşme değil, veri modeli dayatıyor. Sözleşmeye
   bakan bir istemci "duygu serbest" sanıyor.
2. ⚠️ **Yayımlanan örnek masal fixture'ı bu CHECK'i geçemez.**
   `packages/mock/src/fixtures/story-text.ts` içindeki `SAMPLE_STORY_PAGES` şu duyguları
   kullanıyor: `merak`, `tedirginlik`, `cesaret`, `kararlilik`, `hayret`, `sasirma`,
   `sefkat`, `zorlanma`, `zafer`, `sevinc`, `huzur`, `guven`. Bunlardan yalnızca `merak`
   listede var. Yani o fixture bugün veritabanına **INSERT edilemez**; mock ile gerçek
   arasında sessiz bir ayrışma var ve `mock:parity` kapısı bunu er geç yakalayacak.

```ts
// öneri — sözleşme enum'u veri modelinden türesin
export const pageEmotionSchema = z.enum([
  'sakin', 'nese', 'merak', 'hafif_endise', 'cozulme', 'sicak_kapanis',
]);
```

Karar A0'ın: ya sözleşme+fixture 6 değere çekilir (ucuz, bugün yapılabilir), ya da
`PAGE_EMOTION` genişletilir ve `0003_*` sonrası bir migration ile CHECK güncellenir.
Editoryal görüşüm: 6 değer **yeterli ve daha iyi** — duygu alanı görsel prompt'una ve
okuyucu temposuna giriyor, serbest metin oraya gürültü taşır. Fixture'daki zengin duygular
`summaryTr` içinde zaten yaşıyor.

---

**Bloke eden bir şey yok.** İkisi de eklemeli/daraltıcı; A3 tarafı her iki durumda da
çalışır durumda kalır.
