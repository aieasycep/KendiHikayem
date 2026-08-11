import { useState } from "react"

interface Props {
  onBack: () => void
  onGenerate: () => void
}

const children = [
  { id: "ege", name: "Ege", age: "6 yaş", emoji: "🧒" },
  { id: "ada", name: "Ada", age: "4 yaş", emoji: "👧" },
]

const themes = [
  { id: "adventure", label: "Macera", emoji: "⚔️" },
  { id: "sleep", label: "Uyku", emoji: "🌙" },
  { id: "friendship", label: "Arkadaşlık", emoji: "🤝" },
  { id: "courage", label: "Cesaret", emoji: "💪" },
  { id: "animals", label: "Hayvanlar", emoji: "🐾" },
  { id: "space", label: "Uzay", emoji: "🚀" },
  { id: "fairy", label: "Masal", emoji: "🧚" },
  { id: "emotions", label: "Duygular", emoji: "💛" },
  { id: "educational", label: "Öğretici", emoji: "📚" },
  { id: "fantasy", label: "Fantastik", emoji: "🐉" },
]

const heroTypes = [
  { id: "child", label: "Çocuk", emoji: "🧒" },
  { id: "animal", label: "Hayvan", emoji: "🐾" },
  { id: "fantasy", label: "Fantastik", emoji: "🧚" },
  { id: "robot", label: "Robot", emoji: "🤖" },
  { id: "custom", label: "Kendi fikrim", emoji: "✨" },
]

const voices = [
  { id: "mom", label: "Anne", name: "Annemin Sesi", type: "personal", emoji: "👩", available: true },
  { id: "dad", label: "Baba", name: "Babamın Sesi", type: "personal", emoji: "👨", available: true },
  { id: "luna", label: "Luna", name: "Masalsı ve huzurlu", type: "system", emoji: "🌙", available: true },
  { id: "atlas", label: "Atlas", name: "Sıcak erkek sesi", type: "system", emoji: "🌊", available: true },
  { id: "duru", label: "Duru", name: "Yumuşak masal anlatıcısı", type: "system", emoji: "⭐", available: true },
]

const TOTAL_STEPS = 5

export default function StoryCreation({ onBack, onGenerate }: Props) {
  const [step, setStep] = useState(1)
  const [selectedChild, setSelectedChild] = useState("ege")
  const [heroMode, setHeroMode] = useState<"child" | "custom">("child")
  const [heroName, setHeroName] = useState("")
  const [heroType, setHeroType] = useState("child")
  const [selectedThemes, setSelectedThemes] = useState<string[]>(["space"])
  const [storyIdea, setStoryIdea] = useState("")
  const [ageGroup, setAgeGroup] = useState("6-8")
  const [duration, setDuration] = useState("medium")
  const [selectedVoice, setSelectedVoice] = useState("mom")

  const toggleTheme = (id: string) => {
    setSelectedThemes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const childName = children.find((c) => c.id === selectedChild)?.name || "Ege"

  return (
    <div
      style={{
        width: "100%",
        height: 844,
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "52px 24px 0",
          background: "var(--background)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={step === 1 ? onBack : () => setStep(step - 1)}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "white",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: "Nunito",
                fontSize: 12,
                color: "var(--muted-foreground)",
                margin: "0 0 2px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Yeni Hikâye
            </p>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: i < step ? "var(--primary)" : "var(--border)",
                    flex: 1,
                    transition: "background 0.3s ease",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Step content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }} className="screen-scroll">
        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Bu hikâye kimin için?
            </h2>
            <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 24px", fontWeight: 500 }}>
              Masalını kimin için oluşturduğunu seç.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {children.map((child) => (
                <div
                  key={child.id}
                  onClick={() => setSelectedChild(child.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 18px",
                    borderRadius: 18,
                    border: `2px solid ${selectedChild === child.id ? "var(--primary)" : "var(--border)"}`,
                    background: selectedChild === child.id ? "var(--secondary)" : "white",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: selectedChild === child.id ? "0 4px 16px rgba(124,92,191,0.15)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #D4C8F0, #EDE8F8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                    }}
                  >
                    {child.emoji}
                  </div>
                  <div>
                    <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: "0 0 2px" }}>
                      {child.name}
                    </p>
                    <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                      {child.age}
                    </p>
                  </div>
                  {selectedChild === child.id && (
                    <div style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 18px",
                  borderRadius: 18,
                  border: "2px dashed var(--border)",
                  cursor: "pointer",
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                  +
                </div>
                <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 600, color: "var(--muted-foreground)", margin: 0 }}>
                  Başka bir çocuk
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Hikâyemizin kahramanı kim?
            </h2>
            <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 24px", fontWeight: 500 }}>
              İstersen {childName} kahramanı olsun ya da yeni biri oluştur.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {[
                { id: "child" as const, label: `${childName} kahraman olsun`, sub: `Kahraman: ${childName}`, emoji: "🧒" },
                { id: "custom" as const, label: "Başka bir kahraman oluştur", sub: "Sen belirle", emoji: "✨" },
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => setHeroMode(opt.id)}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 18,
                    border: `2px solid ${heroMode === opt.id ? "var(--primary)" : "var(--border)"}`,
                    background: heroMode === opt.id ? "var(--secondary)" : "white",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                  <div>
                    <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 2px" }}>
                      {opt.label}
                    </p>
                    <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                      {opt.sub}
                    </p>
                  </div>
                  {heroMode === opt.id && (
                    <div style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {heroMode === "custom" && (
              <div style={{ animation: "fadeUp 0.3s ease both" }}>
                <input
                  value={heroName}
                  onChange={(e) => setHeroName(e.target.value)}
                  placeholder="Örn. Luna"
                  style={{
                    width: "100%",
                    padding: "16px 18px",
                    borderRadius: 16,
                    border: "2px solid var(--border)",
                    fontFamily: "Nunito",
                    fontSize: 16,
                    color: "var(--foreground)",
                    background: "white",
                    outline: "none",
                    boxSizing: "border-box",
                    marginBottom: 16,
                  }}
                />
                <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Kahraman türü
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {heroTypes.map((ht) => (
                    <div
                      key={ht.id}
                      onClick={() => setHeroType(ht.id)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 12,
                        border: `2px solid ${heroType === ht.id ? "var(--primary)" : "var(--border)"}`,
                        background: heroType === ht.id ? "var(--secondary)" : "white",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{ht.emoji}</span>
                      <span style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: heroType === ht.id ? "var(--primary)" : "var(--foreground)" }}>
                        {ht.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Nasıl bir hikâye?
            </h2>
            <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 20px", fontWeight: 500 }}>
              Birden fazla seçim yapabilirsin.
            </p>

            {/* AI suggestion chip */}
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(176,156,224,0.15), rgba(124,92,191,0.1))",
                border: "1px solid rgba(124,92,191,0.2)",
                marginBottom: 16,
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>✨</span>
              <div>
                <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--primary)", margin: "0 0 6px" }}>
                  Ege için öneri
                </p>
                <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--foreground)", margin: "0 0 8px", lineHeight: 1.5, fontWeight: 500 }}>
                  Ege uzay maceralarını seviyor. Onu küçük bir astronot yapalım mı?
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Uzaya gitsin", "Dinozorlarla tanışsın", "Denizaltı keşfine çıksın"].map((s) => (
                    <span
                      key={s}
                      style={{
                        fontFamily: "Nunito",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--primary)",
                        background: "var(--secondary)",
                        borderRadius: 8,
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {themes.map((theme) => (
                <div
                  key={theme.id}
                  onClick={() => toggleTheme(theme.id)}
                  style={{
                    padding: "14px 14px",
                    borderRadius: 16,
                    border: `2px solid ${selectedThemes.includes(theme.id) ? "var(--primary)" : "var(--border)"}`,
                    background: selectedThemes.includes(theme.id) ? "var(--secondary)" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{theme.emoji}</span>
                  <span style={{ fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: selectedThemes.includes(theme.id) ? "var(--primary)" : "var(--foreground)" }}>
                    {theme.label}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)", margin: "0 0 8px" }}>
              Aklında özel bir hikâye mi var?
            </p>
            <textarea
              value={storyIdea}
              onChange={(e) => setStoryIdea(e.target.value)}
              placeholder="Örneğin: Ege uzaya gidip kaybolan küçük bir yıldızı evine döndürsün."
              rows={3}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 16,
                border: "2px solid var(--border)",
                fontFamily: "Nunito",
                fontSize: 14,
                color: "var(--foreground)",
                background: "white",
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
                lineHeight: 1.5,
              }}
            />
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 0", fontWeight: 500 }}>
              Boş bıraksan da harika bir hikâye oluştururuz.
            </p>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Hikâye ayarları
            </h2>
            <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 24px", fontWeight: 500 }}>
              Masalın yaş grubunu ve uzunluğunu belirle.
            </p>

            <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Yaş grubu
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
              {["0–2", "3–5", "6–8", "9–12"].map((age) => (
                <div
                  key={age}
                  onClick={() => setAgeGroup(age)}
                  style={{
                    padding: "14px",
                    borderRadius: 16,
                    border: `2px solid ${ageGroup === age ? "var(--primary)" : "var(--border)"}`,
                    background: ageGroup === age ? "var(--secondary)" : "white",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: ageGroup === age ? "var(--primary)" : "var(--foreground)" }}>
                    {age}
                  </span>
                  <br />
                  <span style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>
                    yaş
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Hikâye uzunluğu
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { id: "short", label: "Kısa", sub: "Yaklaşık 3 dakika", emoji: "⚡" },
                { id: "medium", label: "Orta", sub: "Yaklaşık 6 dakika", emoji: "📖" },
                { id: "long", label: "Uzun", sub: "Yaklaşık 10 dakika", emoji: "🌙" },
              ].map((d) => (
                <div
                  key={d.id}
                  onClick={() => setDuration(d.id)}
                  style={{
                    padding: "14px 18px",
                    borderRadius: 16,
                    border: `2px solid ${duration === d.id ? "var(--primary)" : "var(--border)"}`,
                    background: duration === d.id ? "var(--secondary)" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{d.emoji}</span>
                  <div>
                    <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: duration === d.id ? "var(--primary)" : "var(--foreground)", margin: "0 0 2px" }}>
                      {d.label}
                    </p>
                    <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                      {d.sub}
                    </p>
                  </div>
                  {duration === d.id && (
                    <div style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5 — Voice */}
        {step === 5 && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Masalı kim anlatsın?
            </h2>
            <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 20px", fontWeight: 500 }}>
              Seçtiğin ses her masalda {childName}'yi bekliyor olacak.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {voices.map((voice) => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  style={{
                    padding: "14px 18px",
                    borderRadius: 18,
                    border: `2px solid ${selectedVoice === voice.id ? "var(--primary)" : "var(--border)"}`,
                    background: selectedVoice === voice.id ? "var(--secondary)" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "all 0.2s ease",
                    boxShadow: selectedVoice === voice.id ? "0 4px 16px rgba(124,92,191,0.15)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: voice.type === "personal"
                        ? "linear-gradient(135deg, #F5C4A8, #F08B6E)"
                        : "linear-gradient(135deg, #D4C8F0, #B09CE0)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                  >
                    {voice.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                        {voice.label}
                      </p>
                      {voice.type === "personal" && (
                        <span
                          style={{
                            fontFamily: "Nunito",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#F08B6E",
                            background: "rgba(240,139,110,0.12)",
                            borderRadius: 6,
                            padding: "2px 8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Kişisel
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                      {voice.name}
                    </p>
                  </div>
                  {/* Play preview */}
                  <button
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: selectedVoice === voice.id ? "var(--primary)" : "var(--muted)",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={selectedVoice === voice.id ? "white" : "var(--muted-foreground)"}>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 160 }} />
      </div>

      {/* Bottom CTA */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 24px 40px",
          background: "linear-gradient(0deg, var(--background) 60%, transparent)",
        }}
      >
        {step < TOTAL_STEPS ? (
          <button
            onClick={() => setStep(step + 1)}
            style={{
              width: "100%",
              padding: "18px",
              borderRadius: 20,
              background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
              border: "none",
              color: "white",
              fontFamily: "Nunito",
              fontSize: 17,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(124,92,191,0.35)",
            }}
          >
            Devam
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Summary */}
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 16,
                background: "white",
                border: "1px solid var(--border)",
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 4,
              }}
            >
              {[
                { label: childName, icon: "🧒" },
                { label: selectedThemes.slice(0, 2).map((t) => themes.find((th) => th.id === t)?.label).join(" + ") || "Uzay", icon: "🎭" },
                { label: duration === "short" ? "3 dk" : duration === "medium" ? "6 dk" : "10 dk", icon: "⏱" },
                { label: voices.find((v) => v.id === selectedVoice)?.label || "Ses", icon: "🎙" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13 }}>{item.icon}</span>
                  <span style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={onGenerate}
              style={{
                width: "100%",
                padding: "18px",
                borderRadius: 20,
                background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
                border: "none",
                color: "white",
                fontFamily: "Nunito",
                fontSize: 17,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 8px 24px rgba(124,92,191,0.35)",
              }}
            >
              Masalımı Oluştur ✨
            </button>
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", margin: "4px 0 0", fontWeight: 500 }}>
              Yaklaşık 20–40 saniye sürebilir.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
