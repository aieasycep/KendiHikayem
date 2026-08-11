/**
 * icons/types.ts — ikon bileşenlerinin ortak sözleşmesi.
 *
 * Tüm ikonlar 24×24 viewBox üzerine çizilir (Figma kaynağıyla aynı), `size`
 * ile ölçeklenir. `color` verilmezse temanın ana metin rengi kullanılır —
 * ikonlar gece temasında kendiliğinden açık renge döner.
 */

export interface IconProps {
  /** Kenar uzunluğu (kare). Varsayılan 24. */
  size?: number;
  /** Çizgi/dolgu rengi. Varsayılan: temanın `ink` rengi. */
  color?: string;
  /** Çizgi kalınlığı. Varsayılan 1.8 (Figma navigasyon ikonlarıyla aynı). */
  strokeWidth?: number;
}

export interface FillableIconProps extends IconProps {
  /** Aktif sekme durumu: çizgi yerine dolgu. */
  filled?: boolean;
}
