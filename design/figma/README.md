# Onaylanan tasarım — Figma Make çıktısı

Bu dizin **referans malzemedir, çalışan kod değildir.** Derlenmez, import edilmez,
lint ve typecheck kapsamı dışındadır. Buradaki ekranlar elle `packages/ui` ve
`apps/mobile` içine taşınır.

## Ne var

| Yol | İçerik |
|---|---|
| `src/index.css` | **Tasarım token'ları** — renk, yarıçap, font tanımları. Tek gerçek kaynak. |
| `src/screens/*.tsx` | 10 ekran (Splash, Onboarding, Home, StoryCreation, StoryGenerating, StoryResult, Library, AudioPlayer, VoiceStudio, Profile) |
| `src/components/BottomNav.tsx` | Alt gezinme |
| `src/imports/pasted_text/masalim-app-design.md` | Tasarımcı brief'i — ürünün duygusu, hedef kullanıcı, marka vaadi |

## Taşırken bilinmesi gerekenler

- **Web React + Tailwind.** React Native'e taşınırken sınıflar `StyleSheet`'e,
  `<div>` `<View>`'a, `<svg>` `react-native-svg`'ye çevrilir.
- **Hiç dış görsel yok.** 39 SVG kod içinde; kapaklar düz renk + emoji.
  Yani eksik varlık sorunu yoktur, tasarım olduğu gibi taşınabilir.
- **Fontlar:** Fraunces (başlık, serif) + Nunito (gövde). İkisi de SIL OFL,
  uygulamaya gömülebilir. Web sürümü Google Fonts'tan çeker; mobilde
  `expo-font` ile paketlenir.
- **Marka adı:** tasarımda `Masalım` geçer, brief'te bunun **geçici** olduğu ve
  token üzerinden değiştirilebilir olması gerektiği yazar. Üründe ad
  **KendiHikayem**'dir; taşırken ad tek bir sabitten okunmalıdır.
- Tasarımdaki 10 ekran ürünün tamamı değildir. Rıza akışı, baskı akışı ve
  ayarlar bölümleri tasarımda yok; onlar **aynı görsel dille** tamamlanır.
