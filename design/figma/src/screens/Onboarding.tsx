import { useState } from "react"

interface Props {
  onDone: () => void
}

const slides = [
  {
    headline: "Her gece ona özel\nbir hikâye.",
    sub: "Yapay zekâ ile çocuğuna özel hikâyeler oluştur, kendi sesinle anlat.",
    illustration: (
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        {/* Parent reading to child */}
        <ellipse cx="110" cy="160" rx="80" ry="12" fill="rgba(176,156,224,0.15)" />
        {/* Armchair */}
        <rect x="50" y="100" width="120" height="60" rx="20" fill="#EDE8F8" />
        <rect x="36" y="90" width="28" height="70" rx="14" fill="#D4C8F0" />
        <rect x="156" y="90" width="28" height="70" rx="14" fill="#D4C8F0" />
        {/* Parent */}
        <circle cx="95" cy="80" r="20" fill="#F5C4A8" />
        <rect x="70" y="98" width="50" height="48" rx="16" fill="#7C5CBF" />
        {/* Child */}
        <circle cx="138" cy="90" r="16" fill="#F5C4A8" />
        <rect x="118" y="104" width="40" height="38" rx="12" fill="#F08B6E" />
        {/* Book */}
        <rect x="78" y="112" width="44" height="32" rx="6" fill="#FAF8F4" stroke="#B09CE0" strokeWidth="1.5" />
        <line x1="100" y1="112" x2="100" y2="144" stroke="#B09CE0" strokeWidth="1" />
        {/* Stars */}
        <circle cx="170" cy="40" r="3" fill="#FFD97D" />
        <circle cx="55" cy="55" r="2" fill="#B09CE0" />
        <circle cx="185" cy="75" r="2" fill="#F08B6E" />
        <path d="M158 25l2 5 5 1-4 4 1 5-4-3-4 3 1-5-4-4 5-1z" fill="#FFD97D" />
      </svg>
    ),
    cta: "Devam",
  },
  {
    headline: "Onun adı,\nonun hikâyesi.",
    sub: "Çocuğunun adı hikâyenin kahramanı olur. Her gece tamamen ona özel.",
    illustration: (
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        {/* Story card */}
        <rect x="30" y="20" width="160" height="140" rx="20" fill="white" stroke="#EDE8F8" strokeWidth="1.5" />
        <rect x="30" y="20" width="160" height="72" rx="20" fill="#EDE8F8" />
        <rect x="30" y="72" width="160" height="20" fill="#EDE8F8" />
        {/* Illustration placeholder */}
        <circle cx="110" cy="55" r="25" fill="#D4C8F0" />
        <circle cx="110" cy="45" r="12" fill="#F5C4A8" />
        <path d="M90 68c0-11 9-18 20-18s20 7 20 18" fill="#7C5CBF" />
        {/* Text lines */}
        <rect x="50" y="108" width="120" height="8" rx="4" fill="#EDE8F8" />
        <rect x="50" y="122" width="80" height="6" rx="3" fill="#F2EDE6" />
        {/* Name badge */}
        <rect x="55" y="136" width="60" height="16" rx="8" fill="linear-gradient(#7C5CBF,#9B7FD4)" />
        <rect x="55" y="136" width="60" height="16" rx="8" fill="#7C5CBF" />
        <text x="85" y="148" textAnchor="middle" fill="white" fontSize="9" fontFamily="Nunito" fontWeight="700">Ege'nin Masalı</text>
        {/* Stars */}
        <circle cx="48" cy="30" r="3" fill="#FFD97D" />
        <circle cx="178" cy="150" r="2" fill="#F08B6E" />
        <path d="M175 28l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#FFD97D" opacity="0.7" />
      </svg>
    ),
    cta: "Devam",
  },
  {
    headline: "Sen okumasan da\nsesin okusun.",
    sub: "Anne ya da babanın sesini bir kere kaydet — her masalda sesin onunla olsun.",
    illustration: (
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        {/* Sound waves from book */}
        <rect x="70" y="70" width="80" height="80" rx="16" fill="white" stroke="#EDE8F8" strokeWidth="1.5" />
        <path d="M90 90C95 85 105 85 110 90C115 95 125 95 130 90" stroke="#7C5CBF" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M82 100C90 90 110 90 118 100C126 110 146 110 154 100" stroke="#B09CE0" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
        {/* Mic */}
        <rect x="100" y="108" width="20" height="28" rx="10" fill="#F08B6E" />
        <path d="M92 124c0 10 8 16 18 16s18-6 18-16" stroke="#F08B6E" strokeWidth="2" fill="none" strokeLinecap="round" />
        <line x1="110" y1="140" x2="110" y2="148" stroke="#F08B6E" strokeWidth="2" strokeLinecap="round" />
        {/* Waveform bars */}
        <rect x="45" y="95" width="6" height="20" rx="3" fill="#B09CE0" opacity="0.4" />
        <rect x="36" y="100" width="6" height="10" rx="3" fill="#B09CE0" opacity="0.3" />
        <rect x="163" y="95" width="6" height="20" rx="3" fill="#B09CE0" opacity="0.4" />
        <rect x="172" y="100" width="6" height="10" rx="3" fill="#B09CE0" opacity="0.3" />
        {/* Heart */}
        <path d="M108 78c0 0-8-6-8-12 0-4 3-6 6-6 1.5 0 3 0.8 4 2 1-1.2 2.5-2 4-2 3 0 6 2 6 6 0 6-12 12-12 12z" fill="#F08B6E" />
      </svg>
    ),
    cta: "Devam",
  },
  {
    headline: "Masalı gerçek bir\nkitaba dönüştür.",
    sub: "AI illüstrasyonlarla oluşturduğun hikâyeyi fiziksel bir çocuk kitabına dönüştür.",
    illustration: (
      <svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        {/* Physical book */}
        <rect x="55" y="30" width="100" height="130" rx="8" fill="#7C5CBF" />
        <rect x="65" y="25" width="100" height="130" rx="8" fill="white" stroke="#EDE8F8" strokeWidth="1.5" />
        <rect x="65" y="25" width="100" height="72" rx="8" fill="#EDE8F8" />
        <rect x="65" y="81" width="100" height="16" fill="#EDE8F8" />
        {/* Cover illustration */}
        <circle cx="115" cy="56" r="20" fill="#D4C8F0" />
        <circle cx="115" cy="47" r="10" fill="#F5C4A8" />
        <path d="M98 68c0-9 8-15 17-15s17 6 17 15" fill="#7C5CBF" />
        {/* Stars in sky */}
        <circle cx="102" cy="38" r="2" fill="#FFD97D" />
        <circle cx="128" cy="35" r="1.5" fill="#FFD97D" />
        {/* Book title */}
        <rect x="78" y="104" width="74" height="8" rx="4" fill="#EDE8F8" />
        <rect x="84" y="118" width="62" height="6" rx="3" fill="#F2EDE6" />
        {/* 3D effect */}
        <rect x="55" y="30" width="10" height="130" rx="4" fill="#5A4190" />
        {/* Shine */}
        <rect x="150" y="30" width="15" height="130" rx="8" fill="rgba(255,255,255,0.15)" />
      </svg>
    ),
    cta: "Başlayalım",
  },
]

export default function Onboarding({ onDone }: Props) {
  const [current, setCurrent] = useState(0)
  const slide = slides[current]

  const next = () => {
    if (current < slides.length - 1) setCurrent(current + 1)
    else onDone()
  }

  return (
    <div
      style={{
        width: "100%",
        minHeight: 844,
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -60,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(176,156,224,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Skip */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "56px 24px 0" }}>
        {current < slides.length - 1 && (
          <button
            onClick={onDone}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted-foreground)",
              fontFamily: "Nunito, sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              padding: "8px 0",
            }}
          >
            Geç
          </button>
        )}
      </div>

      {/* Illustration */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 24,
          animation: "fadeIn 0.4s ease both",
        }}
        key={current}
      >
        {slide.illustration}
      </div>

      {/* Content */}
      <div style={{ padding: "32px 32px 0", animation: "fadeUp 0.5s ease both" }} key={`text-${current}`}>
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 34,
            fontWeight: 600,
            color: "var(--foreground)",
            margin: "0 0 16px",
            lineHeight: 1.2,
            whiteSpace: "pre-line",
            letterSpacing: "-0.01em",
          }}
        >
          {slide.headline}
        </h2>
        <p
          style={{
            fontFamily: "Nunito, sans-serif",
            fontSize: 16,
            color: "var(--muted-foreground)",
            lineHeight: 1.6,
            margin: 0,
            fontWeight: 500,
          }}
        >
          {slide.sub}
        </p>
      </div>

      {/* Bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 0,
          right: 0,
          padding: "0 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          alignItems: "center",
        }}
      >
        {/* Dots */}
        <div style={{ display: "flex", gap: 8 }}>
          {slides.map((_, i) => (
            <div
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: i === current ? "var(--primary)" : "var(--border)",
                transition: "all 0.3s ease",
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={next}
          style={{
            width: "100%",
            padding: "18px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
            border: "none",
            color: "white",
            fontFamily: "Nunito, sans-serif",
            fontSize: 17,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(124, 92, 191, 0.35)",
            letterSpacing: "0.01em",
          }}
        >
          {slide.cta}
        </button>
      </div>
    </div>
  )
}
