interface Props {
  onVoiceStudio: () => void
}

const children = [
  { name: "Ege", age: "6 yaş", stories: 8, emoji: "🧒", active: true },
  { name: "Ada", age: "4 yaş", stories: 5, emoji: "👧", active: false },
]

const menuItems = [
  { icon: "🎙", label: "Seslerimiz", sub: "2 ses kaydedildi", badge: null },
  { icon: "📦", label: "Siparişlerim", sub: "1 aktif sipariş", badge: "1" },
  { icon: "👑", label: "Aboneliğim", sub: "Premium · 11 Ağustos 2027'ye kadar", badge: null },
  { icon: "🔔", label: "Bildirimler", sub: "Tüm bildirimler açık", badge: null },
  { icon: "🔒", label: "Gizlilik & Ses Verilerim", sub: "Güvenli ve şifreli", badge: null },
  { icon: "⚙️", label: "Ayarlar", sub: "Dil, erişilebilirlik", badge: null },
]

export default function Profile({ onVoiceStudio }: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: 844,
        overflowY: "auto",
        background: "var(--background)",
        paddingBottom: 100,
      }}
      className="screen-scroll"
    >
      {/* Header */}
      <div
        style={{
          padding: "52px 24px 28px",
          background: "linear-gradient(180deg, rgba(176,156,224,0.12) 0%, transparent 100%)",
        }}
      >
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 30,
            fontWeight: 700,
            color: "var(--foreground)",
            margin: "0 0 20px",
            letterSpacing: "-0.01em",
          }}
        >
          Profil & Aile
        </h1>

        {/* User card */}
        <div
          style={{
            padding: "20px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #7C5CBF, #9B7FD4)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 8px 24px rgba(124,92,191,0.3)",
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              border: "2px solid rgba(255,255,255,0.3)",
            }}
          >
            👩
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "white", margin: "0 0 2px" }}>
              Ayşe Yılmaz
            </p>
            <p style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.75)", margin: "0 0 8px", fontWeight: 500 }}>
              ayse@email.com
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "4px 10px" }}>
              <span style={{ fontSize: 12 }}>👑</span>
              <span style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: "white" }}>Premium Üye</span>
            </div>
          </div>
          <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Children */}
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Çocuklarım
          </p>
          <button style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--primary)", cursor: "pointer" }}>
            + Çocuk Ekle
          </button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {children.map((child) => (
            <div
              key={child.name}
              style={{
                flex: 1,
                padding: "16px",
                borderRadius: 18,
                background: child.active ? "var(--secondary)" : "white",
                border: `2px solid ${child.active ? "var(--primary)" : "var(--border)"}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                position: "relative",
              }}
            >
              {child.active && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--primary)",
                  }}
                />
              )}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #D4C8F0, #EDE8F8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                }}
              >
                {child.emoji}
              </div>
              <p style={{ fontFamily: "Fraunces, serif", fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: "0" }}>
                {child.name}
              </p>
              <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                {child.age}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12 }}>📚</span>
                <span style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
                  {child.stories} hikâye
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu */}
      <div style={{ padding: "0 24px" }}>
        <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Hesabım
        </p>
        <div style={{ background: "white", borderRadius: 20, border: "1px solid var(--border)", overflow: "hidden" }}>
          {menuItems.map((item, i) => (
            <div
              key={item.label}
              onClick={item.label === "Seslerimiz" ? onVoiceStudio : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderBottom: i < menuItems.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 1px" }}>
                  {item.label}
                </p>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                  {item.sub}
                </p>
              </div>
              {item.badge && (
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 800, color: "white" }}>{item.badge}</span>
                </div>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div style={{ padding: "16px 24px 0" }}>
        <button
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 16,
            background: "white",
            border: "1px solid var(--border)",
            fontFamily: "Nunito",
            fontSize: 15,
            fontWeight: 700,
            color: "#E05454",
            cursor: "pointer",
          }}
        >
          Çıkış Yap
        </button>
      </div>
    </div>
  )
}
