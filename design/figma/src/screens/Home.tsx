interface Props {
  onCreateStory: () => void
  onOpenStory: (id: string) => void
}

const recentStories = [
  {
    id: "1",
    title: "Ege ve Kayıp Yıldız",
    child: "Ege",
    duration: "6 dk",
    narrator: "Anne'nin sesi",
    cover: "#D4C8F0",
    emoji: "⭐",
  },
  {
    id: "2",
    title: "Cesur Minik Astronot",
    child: "Ege",
    duration: "4 dk",
    narrator: "Duru",
    cover: "#B8D8E8",
    emoji: "🚀",
  },
  {
    id: "3",
    title: "Ormanın Kaşifi",
    child: "Ada",
    duration: "8 dk",
    narrator: "Baba'nın sesi",
    cover: "#C5DFC8",
    emoji: "🌿",
  },
]

const suggestions = [
  { title: "Ege için Uzay Macerası", theme: "Uzay", emoji: "🚀" },
  { title: "Uykuya Küsen Ayıcık", theme: "Uyku", emoji: "🐻" },
  { title: "Denizin Altındaki Sır", theme: "Macera", emoji: "🐠" },
]

const categories = [
  { label: "Uyku", emoji: "🌙", color: "#1E2D45" },
  { label: "Macera", emoji: "⚔️", color: "#7C5CBF" },
  { label: "Öğretici", emoji: "📚", color: "#7BA7C9" },
  { label: "Duygular", emoji: "💛", color: "#F08B6E" },
  { label: "Arkadaşlık", emoji: "🤝", color: "#8DB89A" },
  { label: "Hayal Gücü", emoji: "✨", color: "#B09CE0" },
]

export default function Home({ onCreateStory, onOpenStory }: Props) {
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
          padding: "56px 24px 24px",
          background: "linear-gradient(180deg, rgba(176,156,224,0.15) 0%, transparent 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: 14,
                color: "var(--muted-foreground)",
                margin: "0 0 4px",
                fontWeight: 500,
              }}
            >
              İyi akşamlar 👋
            </p>
            <h1
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 26,
                fontWeight: 600,
                color: "var(--foreground)",
                margin: 0,
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              Bu gece hangi masala
              <br />
              yolculuk ediyoruz?
            </h1>
          </div>
          {/* Child avatar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #D4C8F0, #B09CE0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                border: "2px solid white",
                boxShadow: "0 2px 8px rgba(124,92,191,0.2)",
              }}
            >
              🧒
            </div>
            <span
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: 11,
                color: "var(--primary)",
                fontWeight: 700,
              }}
            >
              Ege
            </span>
          </div>
        </div>
      </div>

      {/* Hero CTA */}
      <div style={{ padding: "0 24px 24px" }}>
        <div
          onClick={onCreateStory}
          style={{
            borderRadius: 24,
            background: "linear-gradient(135deg, #2D1B69 0%, #7C5CBF 60%, #9B7FD4 100%)",
            padding: "28px 24px",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(124,92,191,0.3)",
          }}
        >
          {/* Decorative circles */}
          <div
            style={{
              position: "absolute",
              right: -20,
              top: -20,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.07)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 30,
              bottom: -30,
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
            }}
          />
          {/* Stars */}
          <div style={{ position: "absolute", top: 16, right: 20, fontSize: 20, opacity: 0.8 }}>✨</div>
          <div style={{ position: "absolute", bottom: 16, right: 60, fontSize: 14, opacity: 0.6 }}>⭐</div>

          <p
            style={{
              fontFamily: "Nunito, sans-serif",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              margin: "0 0 8px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Yeni Masal
          </p>
          <h3
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 24,
              fontWeight: 600,
              color: "white",
              margin: "0 0 20px",
              lineHeight: 1.2,
              maxWidth: 200,
            }}
          >
            Ege için bir hikâye oluştur
          </h3>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "white",
              borderRadius: 14,
              padding: "10px 20px",
            }}
          >
            <span style={{ fontSize: 16 }}>✨</span>
            <span
              style={{
                fontFamily: "Nunito, sans-serif",
                fontSize: 14,
                fontWeight: 800,
                color: "var(--primary)",
              }}
            >
              Masalımı Oluştur
            </span>
          </div>
        </div>
      </div>

      {/* AI Suggestions */}
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--foreground)",
              margin: 0,
            }}
          >
            Ege için öneriler
          </h2>
          <span
            style={{
              fontFamily: "Nunito, sans-serif",
              fontSize: 13,
              color: "var(--primary)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tümü
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={onCreateStory}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                background: "white",
                borderRadius: 16,
                border: "1px solid var(--border)",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: "var(--secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {s.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--foreground)",
                    margin: "0 0 2px",
                  }}
                >
                  {s.title}
                </p>
                <p
                  style={{
                    fontFamily: "Nunito, sans-serif",
                    fontSize: 12,
                    color: "var(--muted-foreground)",
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {s.theme} teması
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Continue listening */}
      <div style={{ padding: "0 24px 24px" }}>
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 18,
            fontWeight: 600,
            color: "var(--foreground)",
            margin: "0 0 12px",
          }}
        >
          Kaldığın yerden devam et
        </h2>
        <div
          onClick={() => onOpenStory("1")}
          style={{
            borderRadius: 20,
            overflow: "hidden",
            background: "white",
            border: "1px solid var(--border)",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              height: 80,
              background: "linear-gradient(135deg, #D4C8F0, #EDE8F8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            ⭐
          </div>
          <div style={{ padding: "14px 16px" }}>
            <p
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--foreground)",
                margin: "0 0 4px",
              }}
            >
              Ege ve Kayıp Yıldız
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>
                Anne'nin sesi · 6 dk
              </span>
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "var(--muted-foreground)",
                  opacity: 0.4,
                }}
              />
              <span style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>
                %68 tamamlandı
              </span>
            </div>
            {/* Progress */}
            <div
              style={{
                marginTop: 10,
                height: 4,
                background: "var(--muted)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "68%",
                  height: "100%",
                  background: "linear-gradient(90deg, var(--primary), var(--lavender))",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent stories carousel */}
      <div style={{ padding: "0 0 24px" }}>
        <div style={{ padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--foreground)",
              margin: 0,
            }}
          >
            En son oluşturdukların
          </h2>
          <span style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--primary)", fontWeight: 600, cursor: "pointer" }}>
            Tümü
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            padding: "0 24px",
            scrollbarWidth: "none",
          }}
        >
          {recentStories.map((story) => (
            <div
              key={story.id}
              onClick={() => onOpenStory(story.id)}
              style={{
                flexShrink: 0,
                width: 140,
                borderRadius: 16,
                background: "white",
                border: "1px solid var(--border)",
                overflow: "hidden",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  height: 100,
                  background: story.cover,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 36,
                }}
              >
                {story.emoji}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <p
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    margin: "0 0 4px",
                    lineHeight: 1.3,
                  }}
                >
                  {story.title}
                </p>
                <p
                  style={{
                    fontFamily: "Nunito",
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {story.duration} · {story.narrator}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tonight's categories */}
      <div style={{ padding: "0 24px 32px" }}>
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 18,
            fontWeight: 600,
            color: "var(--foreground)",
            margin: "0 0 12px",
          }}
        >
          Bu gece için
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          {categories.map((cat) => (
            <div
              key={cat.label}
              onClick={onCreateStory}
              style={{
                borderRadius: 14,
                padding: "14px 8px",
                background: "white",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <span style={{ fontSize: 22 }}>{cat.emoji}</span>
              <span
                style={{
                  fontFamily: "Nunito",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--foreground)",
                  textAlign: "center",
                }}
              >
                {cat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
