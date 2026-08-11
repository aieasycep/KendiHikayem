/**
 * messages.tr.ts — every sentence a parent reads when something is blocked.
 *
 * SPEC §11.0: the message says what happened and what to do next. "Bir hata oluştu" is not
 * an acceptable string in this product — the parent has just typed their child's name into
 * a form and a vague failure reads as "this app is broken", not "try a different word".
 *
 * The contract's `ERROR_CATALOG` owns the generic wording per error code; these are the
 * SPECIFIC ones, chosen because we know exactly which rule fired. Where we do not know
 * more than the code, the catalogue text is used instead of paraphrasing it here.
 */

import { ERROR_CATALOG } from '@kendihikayem/contract';

import type { SafetyViolationCode } from './types';

export const SAFETY_MESSAGES_TR: Record<SafetyViolationCode, string> = {
  /* ── K1 input ─────────────────────────────────────────────────────────── */
  NAME_EMPTY: 'Kahramanın adını yazmadınız. Çocuğunuzun adını yazın; masal ona özel olsun.',
  NAME_TOO_LONG: 'Ad en fazla 30 karakter olabilir. Kısa bir ad ya da takma ad kullanın.',
  NAME_INVALID_CHARS: ERROR_CATALOG.INVALID_NAME.messageTr,
  NAME_CONTROL_CHARS:
    'Adda satır sonu veya görünmez karakter var. Adı tek satırda, sade biçimde yazın.',
  FREE_TEXT_TOO_LONG: 'Hikaye fikri en fazla 200 karakter olabilir. Fikrinizi bir iki cümleye indirin.',
  FREE_TEXT_CONTROL_CHARS:
    'Hikaye fikrinde satır sonu veya görünmez karakter var. Tek paragraf, sade metin yazın.',
  INJECTION_PATTERN: ERROR_CATALOG.INJECTION_DETECTED.messageTr,

  /* ── K4a deterministic output ─────────────────────────────────────────── */
  BANNED_TERM:
    'Metinde çocuklar için uygun bulmadığımız bir ifade geçti ve masal yeniden yazılıyor. Krediniz harcanmadı.',
  AGE_BANNED_TERM: ERROR_CATALOG.AGE_POLICY_VIOLATION.messageTr,
  BRAND_OR_COPYRIGHT:
    'Masalda telifli bir karakter ya da marka adı geçti. Özgün bir kahraman için temayı biraz değiştirip tekrar deneyin.',
  RELIGIOUS_NOT_OPTED_IN:
    'Bu masalda dini içerik geçti, ama ayarlarınızda bu seçenek kapalı. Dilerseniz ayarlardan açabilir ya da farklı bir tema seçebilirsiniz.',
  CANARY_LEAK:
    'Masal üretimi beklenmedik bir çıktı verdi ve yayımlanmadı. Krediniz harcanmadı, lütfen tekrar deneyin.',
  HERO_NAME_MISSING:
    'Masalda çocuğunuzun adı geçmiyor. Masalı yeniden ürettik; sorun sürerse farklı bir tema deneyin.',

  /* ── TR quality gate ──────────────────────────────────────────────────── */
  NAME_INFLECTION_WRONG:
    'Masalda adın ekleri Türkçe kurallarına uymuyordu (ör. "Elif\'e" yerine "Elif\'a"). Masal yeniden yazılıyor.',
  NAME_APOSTROPHE_MISSING:
    'Masalda özel ada gelen ekler kesme işareti olmadan yazılmış. Masal yeniden yazılıyor.',
  NAME_SPELLING_INCONSISTENT:
    'Masalda çocuğunuzun adı farklı biçimlerde yazılmış. Masal yeniden yazılıyor.',
  PAGE_WORD_COUNT_OUT_OF_RANGE:
    'Sayfa uzunlukları seçtiğiniz yaş grubuna uymuyor. Masal, o yaşa uygun uzunlukta yeniden yazılıyor.',
  SENTENCE_TOO_LONG:
    'Cümleler bu yaş grubu için fazla uzundu. Masal daha kısa cümlelerle yeniden yazılıyor.',
  READABILITY_BELOW_TARGET:
    'Metin bu yaş grubu için fazla ağırdı. Masal daha sade bir dille yeniden yazılıyor.',
  WORD_TOO_LONG:
    'Metinde bu yaş için fazla uzun kelimeler vardı. Masal daha sade kelimelerle yeniden yazılıyor.',
  TRANSLATIONESE:
    'Metnin dili doğal Türkçe akışında değildi. Masal yeniden yazılıyor — çeviri gibi okunan bir masal yayımlamıyoruz.',
  REFRAIN_MISSING:
    'Bu yaş grubunda her sayfada dönen bir nakarat olmalı. Masal nakaratlı biçimde yeniden yazılıyor.',
  UNRESOLVED_ENDING:
    'Masal güvenli bir kapanışla bitmiyordu. Sıcak bir sonla yeniden yazılıyor.',
  TITLE_TOO_LONG: 'Başlık çok uzundu; daha kısa bir başlıkla yeniden üretiliyor.',

  /* ── K4c judge ────────────────────────────────────────────────────────── */
  AGE_RUBRIC_VIOLATION: ERROR_CATALOG.AGE_POLICY_VIOLATION.messageTr,

  /* ── K2 / K4b vendor moderation ───────────────────────────────────────── */
  MODERATION_FLAGGED: ERROR_CATALOG.MODERATION_BLOCKED.messageTr,
};
