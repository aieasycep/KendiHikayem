interface Props {
  onDone: () => void
}

export default function Splash({ onDone }: Props) {
  return (
    <div
      onClick={onDone}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 844,
        background: "linear-gradient(160deg, #1A0F3C 0%, #2D1B69 40%, #0D1B2E 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Stars */}
      {Array.from({ length: 28 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            borderRadius: "50%",
            background: "white",
            opacity: 0.4 + (i % 5) * 0.1,
            top: `${(i * 37 + 7) % 100}%`,
            left: `${(i * 53 + 11) % 100}%`,
            animation: `pulse-soft ${1.5 + (i % 4) * 0.5}s ease infinite`,
            animationDelay: `${(i * 0.3) % 2}s`,
          }}
        />
      ))}

      {/* Moon */}
      <div
        style={{
          position: "absolute",
          top: 80,
          right: 60,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(255, 220, 150, 0.15)",
          border: "2px solid rgba(255, 220, 150, 0.3)",
          animation: "float 4s ease-in-out infinite",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 12,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255, 220, 150, 0.25)",
          }}
        />
      </div>

      {/* Center content */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, zIndex: 1 }}>
        {/* Logo illustration — open book */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: "linear-gradient(135deg, rgba(176, 156, 224, 0.3), rgba(124, 92, 191, 0.4))",
            border: "1px solid rgba(176, 156, 224, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
            animation: "float 3s ease-in-out infinite",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <path d="M26 10C22 6 14 5 6 8v28c8-3 16-2 20 2V10z" fill="rgba(255,220,150,0.6)" stroke="rgba(255,220,150,0.9)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M26 10C30 6 38 5 46 8v28c-8-3-16-2-20 2V10z" fill="rgba(176,156,224,0.5)" stroke="rgba(176,156,224,0.9)" strokeWidth="1.5" strokeLinejoin="round" />
            <line x1="26" y1="10" x2="26" y2="40" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            {/* Stars on book */}
            <circle cx="14" cy="22" r="2" fill="rgba(255,220,150,0.9)" />
            <circle cx="38" cy="18" r="1.5" fill="rgba(176,156,224,1)" />
            <circle cx="38" cy="26" r="1" fill="rgba(255,255,255,0.7)" />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 48,
              fontWeight: 600,
              color: "white",
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              animation: "fadeUp 0.8s ease both",
            }}
          >
            Masalım
          </h1>
          <p
            style={{
              fontFamily: "Nunito, sans-serif",
              fontSize: 14,
              color: "rgba(176, 156, 224, 0.9)",
              margin: 0,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 500,
              animation: "fadeUp 0.8s ease 0.2s both",
            }}
          >
            Kişisel Masal Dünyası
          </p>
        </div>
      </div>

      {/* Tap hint */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          fontFamily: "Nunito, sans-serif",
          fontSize: 13,
          color: "rgba(255,255,255,0.35)",
          animation: "pulse-soft 2s ease infinite",
          letterSpacing: "0.04em",
        }}
      >
        Başlamak için dokun
      </div>
    </div>
  )
}
