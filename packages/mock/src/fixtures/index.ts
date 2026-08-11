/**
 * fixtures — TÜM sahte veri tek yerden dışa aktarılır.
 *
 * Fixture'ların tamamı sözleşme şemalarıyla `schema.parse()` edilerek üretilir:
 * kontrat değişip fixture eskirse mock, İLK IMPORT'TA hata fırlatır. Sessizce
 * yanlış veri servis etmez.
 */

export * from './ids';
export * from './media';
export * from './catalog';
export * from './story-text';
export * from './story';
export * from './audio';
export * from './voice';
export * from './user';
export * from './commerce';
export * from './jobs';
export * from './suggestions';
