interface Props {
  onListen: () => void
  onBack: () => void
}

const actions = [
  { label: "Oku", emoji: "📖" },
  { label: "Düzenle", emoji: "✏️" },
  { label: "Görselleştir", emoji: "🎨" },
  { label: "Kitap Yap", emoji: "📚" },
  { label: "Paylaş", emoji: "🔗" },
]

export default function StoryResult({ onListen, onBack }: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: 844,
        overflowY: "auto",
        background: "var(--background)",
        paddingBottom: 40,
      }}
      className="screen-scroll"
    >
      {/* Cover */}
      <div
        style={{
          height: 360,
          background: "linear-gradient(160deg, #2D1B69 0%, #7C5CBF 60%, #B09CE0 100%)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Stars */}
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: i % 3 === 0 ? 4 : 2,
              height: i % 3 === 0 ? 4 : 2,
              borderRadius: "50%",
              background: "white",
              opacity: 0.3 + (i % 4) * 0.1,
              top: `${(i * 53 + 7) % 100}%`,
              left: `${(i * 71 + 11) % 100}%`,
            }}
          />
        ))}

        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            top: 52,
            left: 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {/* Share */}
        <button
          style={{
            position: "absolute",
            top: 52,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>

        {/* Illustration */}
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 32,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 72,
            backdropFilter: "blur(8px)",
            animation: "float 4s ease-in-out infinite",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          ⭐
        </div>

        {/* Confetti dots */}
        {["#FFD97D", "#F08B6E", "#8DB89A", "#B09CE0"].map((color, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              top: `${30 + i * 15}%`,
              left: i % 2 === 0 ? `${15 + i * 10}%` : `${70 - i * 8}%`,
              animation: `float ${2 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Info */}
      <div style={{ padding: "28px 24px 0", animation: "fadeUp 0.5s ease both" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(124,92,191,0.1)",
            borderRadius: 20,
            padding: "6px 14px",
            marginBottom: 12,
          }}
        >
          <span style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Ege için hazırlandı
          </span>
        </div>

        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 30,
            fontWeight: 700,
            color: "var(--foreground)",
            margin: "0 0 16px",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
          }}
        >
          Ege ve Kayıp Yıldız
        </h1>

        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          {[
            { icon: "⏱", text: "6 dakika" },
            { icon: "🎙", text: "Anne'nin sesi" },
            { icon: "🚀", text: "Uzay · Macera" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)" }}>
                {item.text}
              </span>
            </div>
          ))}
        </div>

        {/* Listen CTA */}
        <button
          onClick={onListen}
          style={{
            width: "100%",
            padding: "20px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
            border: "none",
            color: "white",
            fontFamily: "Nunito",
            fontSize: 18,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(124,92,191,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Dinlemeye Başla
        </button>

        {/* Secondary actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
          {actions.map((action) => (
            <div
              key={action.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "12px 4px",
                borderRadius: 14,
                background: "white",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 20 }}>{action.emoji}</span>
              <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center" }}>
                {action.label}
              </span>
            </div>
          ))}
        </div>

        {/* Story excerpt */}
        <div
          style={{
            marginTop: 28,
            padding: "20px",
            borderRadius: 20,
            background: "white",
            border: "1px solid var(--border)",
          }}
        >
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--primary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Hikâyeden bir kesit
          </p>
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              color: "var(--foreground)",
              lineHeight: 1.7,
              margin: 0,
              fontWeight: 400,
              fontStyle: "italic",
            }}
          >
            "Ege küçük uzay giysisini giydi ve rokete atladı. Gökyüzü karanlıktı ama orada, milyonlarca yıldızın arasında, küçük bir ışık yanıp sönüyordu. 'Seni bulacağım,' diye fısıldadı Ege…"
          </p>
        </div>
      </div>
    </div>
  )
}
