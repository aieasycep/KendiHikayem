import { useState } from "react"

interface Props {
  onOpenStory: (id: string) => void
}

const stories = [
  {
    id: "1",
    title: "Ege ve Kayıp Yıldız",
    child: "Ege",
    duration: "6 dk",
    narrator: "Anne'nin sesi",
    cover: "#D4C8F0",
    emoji: "⭐",
    date: "Dün",
    badges: ["Anne'nin sesi"],
    themes: "Uzay · Macera",
  },
  {
    id: "2",
    title: "Cesur Minik Astronot",
    child: "Ege",
    duration: "4 dk",
    narrator: "Duru",
    cover: "#B8D8E8",
    emoji: "🚀",
    date: "3 gün önce",
    badges: ["Kitap hazır"],
    themes: "Uzay",
  },
  {
    id: "3",
    title: "Ormanın En Küçük Kaşifi",
    child: "Ada",
    duration: "8 dk",
    narrator: "Baba'nın sesi",
    cover: "#C5DFC8",
    emoji: "🌿",
    date: "1 hafta önce",
    badges: ["Baba'nın sesi", "Kitap hazır"],
    themes: "Macera · Hayvanlar",
  },
  {
    id: "4",
    title: "Uykuya Küsen Ayıcık",
    child: "Ege",
    duration: "5 dk",
    narrator: "Luna",
    cover: "#F5C4A8",
    emoji: "🐻",
    date: "2 hafta önce",
    badges: [],
    themes: "Uyku",
  },
  {
    id: "5",
    title: "Denizin Altındaki Sır",
    child: "Ada",
    duration: "7 dk",
    narrator: "Atlas",
    cover: "#A8D4E8",
    emoji: "🐠",
    date: "3 hafta önce",
    badges: [],
    themes: "Macera · Deniz",
  },
]

const tabs = ["Tümü", "Sesli", "Kitaplar", "Favoriler"]

export default function Library({ onOpenStory }: Props) {
  const [activeTab, setActiveTab] = useState("Tümü")
  const [search, setSearch] = useState("")

  const filtered = stories.filter((s) => {
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    if (activeTab === "Sesli") return s.narrator.includes("sesi")
    if (activeTab === "Kitaplar") return s.badges.includes("Kitap hazır")
    return true
  })

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
      <div style={{ padding: "52px 24px 20px" }}>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 30,
            fontWeight: 700,
            color: "var(--foreground)",
            margin: "0 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          Hikâyelerim
        </h1>
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
          {stories.length} hikâye · 2 çocuk
        </p>
      </div>

      {/* Search */}
      <div style={{ padding: "0 24px 16px" }}>
        <div style={{ position: "relative" }}>
          <svg
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hikâye ara…"
            style={{
              width: "100%",
              padding: "14px 14px 14px 40px",
              borderRadius: 16,
              border: "2px solid var(--border)",
              fontFamily: "Nunito",
              fontSize: 15,
              color: "var(--foreground)",
              background: "white",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: "0 24px 20px", display: "flex", gap: 8 }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 18px",
              borderRadius: 12,
              border: "none",
              background: activeTab === tab ? "var(--primary)" : "white",
              color: activeTab === tab ? "white" : "var(--muted-foreground)",
              fontFamily: "Nunito",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s ease",
              outline: activeTab === tab ? "none" : "1px solid var(--border)",
              boxShadow: activeTab === tab ? "0 4px 12px rgba(124,92,191,0.3)" : "none",
            } as React.CSSProperties}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Stories list */}
      {filtered.length === 0 ? (
        <div style={{ padding: "60px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px" }}>
            İlk masalın burada yaşayacak.
          </h3>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: "0 0 24px", lineHeight: 1.5 }}>
            Henüz bu kategoride hikâye yok.
          </p>
        </div>
      ) : (
        <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((story) => (
            <div
              key={story.id}
              onClick={() => onOpenStory(story.id)}
              style={{
                display: "flex",
                gap: 14,
                padding: "14px",
                background: "white",
                borderRadius: 20,
                border: "1px solid var(--border)",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.2s ease",
              }}
            >
              {/* Cover */}
              <div
                style={{
                  width: 72,
                  height: 90,
                  borderRadius: 12,
                  background: story.cover,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                  flexShrink: 0,
                }}
              >
                {story.emoji}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    margin: "0 0 4px",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {story.title}
                </h3>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "0 0 6px", fontWeight: 500 }}>
                  {story.child} · {story.duration} · {story.narrator}
                </p>
                <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: "0 0 8px", fontWeight: 500, opacity: 0.7 }}>
                  {story.themes}
                </p>

                {/* Badges */}
                {story.badges.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {story.badges.map((badge) => (
                      <span
                        key={badge}
                        style={{
                          fontFamily: "Nunito",
                          fontSize: 10,
                          fontWeight: 700,
                          color: badge.includes("sesi") ? "#F08B6E" : "var(--primary)",
                          background: badge.includes("sesi") ? "rgba(240,139,110,0.12)" : "var(--secondary)",
                          borderRadius: 6,
                          padding: "2px 8px",
                        }}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Date + actions */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>
                  {story.date}
                </span>
                <button
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--secondary)",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
