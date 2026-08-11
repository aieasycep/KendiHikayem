/**
 * suggestions.ts — sihirbaz tema adımındaki "AI öneri kutusu" içeriği
 * (Figma `StoryCreation` 3. adım: "Ege için öneri … astronot yapalım mı?").
 *
 * Sözleşmede öneri ucu YOKTUR; bu yüzden içerik ekrana gömülmez, buradan
 * beslenir. Seçim çocuğun `interests` kodlarıyla eşleşir (packages/mock
 * `CHILDREN` fixture'ı ile aynı katalog kodları); eşleşme yoksa `varsayilan`
 * kaydı kullanılır. `{cocuk}` yer tutucusu ekranda çocuğun adıyla değiştirilir.
 */

export interface StorySuggestion {
  /** Eşleştiği ilgi alanı kodu (catalog `INTERESTS`), ya da 'varsayilan'. */
  code: string;
  /** Gövde cümlesi — `{cocuk}` çocuğun adıyla değiştirilir. */
  bodyTr: string;
  /** Tek dokunuşla hikaye fikri olarak uygulanan öneri çipleri. */
  chipsTr: string[];
}

export const STORY_SUGGESTIONS: StorySuggestion[] = [
  {
    code: 'uzay',
    bodyTr: '{cocuk} uzay maceralarını seviyor. Onu küçük bir astronot yapalım mı?',
    chipsTr: ['Uzaya gitsin', 'Dinozorlarla tanışsın', 'Denizaltı keşfine çıksın'],
  },
  {
    code: 'hayvanlar',
    bodyTr: '{cocuk} hayvanları çok seviyor. Onu konuşan bir ormanın konuğu yapalım mı?',
    chipsTr: ['Ormanda kaybolan bir yavruyu bulsun', 'Kuşlarla göç etsin', 'Bir kediyle arkadaş olsun'],
  },
  {
    code: 'deniz',
    bodyTr: '{cocuk} denizi seviyor. Onu küçük bir denizci yapalım mı?',
    chipsTr: ['Denizaltı keşfine çıksın', 'Bir deniz fenerini aydınlatsın', 'Yunuslarla yüzsün'],
  },
  {
    code: 'futbol',
    bodyTr: '{cocuk} futbolu seviyor. Onu takımının küçük kahramanı yapalım mı?',
    chipsTr: ['Son dakika golünü atsın', 'Takımına cesaret versin', 'Kayıp topu bulsun'],
  },
  {
    code: 'muzik',
    bodyTr: '{cocuk} müziği seviyor. Onu şarkı söyleyen bir ormanın şefi yapalım mı?',
    chipsTr: ['Kayıp melodiyi bulsun', 'Yıldızlara ninni söylesin', 'Bir orkestra kursun'],
  },
  {
    code: 'resim',
    bodyTr: '{cocuk} resim yapmayı seviyor. Onu renkleri geri getiren ressam yapalım mı?',
    chipsTr: ['Soluk bir şehri boyasın', 'Gökkuşağını onarsın', 'Rüyalarını çizsin'],
  },
  {
    code: 'dinozor',
    bodyTr: '{cocuk} dinozorları seviyor. Onu dinozorların arasına gönderelim mi?',
    chipsTr: ['Dinozorlarla tanışsın', 'Yavru bir dinozoru evine götürsün', 'Fosil avına çıksın'],
  },
  {
    code: 'bilim',
    bodyTr: '{cocuk} deneyleri seviyor. Onu küçük bir mucit yapalım mı?',
    chipsTr: ['Uçan bir makine yapsın', 'Kayıp formülü bulsun', 'Robot arkadaşını tamir etsin'],
  },
  {
    code: 'varsayilan',
    bodyTr: '{cocuk} için masalsı bir fikrimiz var. Onu küçük bir kâşif yapalım mı?',
    chipsTr: ['Uzaya gitsin', 'Dinozorlarla tanışsın', 'Denizaltı keşfine çıksın'],
  },
];

const FALLBACK_SUGGESTION: StorySuggestion = {
  code: 'varsayilan',
  bodyTr: '{cocuk} için masalsı bir fikrimiz var. Onu küçük bir kâşif yapalım mı?',
  chipsTr: ['Uzaya gitsin', 'Dinozorlarla tanışsın', 'Denizaltı keşfine çıksın'],
};

/** Çocuğun ilgi alanlarına göre öneri seç; eşleşme yoksa varsayılan döner. */
export function suggestionForInterests(interests: readonly string[]): StorySuggestion {
  const match = STORY_SUGGESTIONS.find(
    (item) => item.code !== 'varsayilan' && interests.includes(item.code),
  );
  return match ?? FALLBACK_SUGGESTION;
}
