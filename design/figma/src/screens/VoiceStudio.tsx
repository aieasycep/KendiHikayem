import { useState } from "react"

interface Props {
  onBack: () => void
}

type VoiceStudioView = "list" | "recording" | "processing" | "success"

export default function VoiceStudio({ onBack }: Props) {
  const [view, setView] = useState<VoiceStudioView>("list")
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [timerRef, setTimerRef] = useState<ReturnType<typeof setInterval> | null>(null)

  const startRecording = () => {
    setRecording(true)
    const interval = setInterval(() => {
      setRecordingTime((t) => t + 1)
    }, 1000)
    setTimerRef(interval)
  }

  const stopRecording = () => {
    setRecording(false)
    if (timerRef) clearInterval(timerRef)
    setView("processing")
    setTimeout(() => setView("success"), 2500)
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

  if (view === "recording") {
    return (
      <div
        style={{
          width: "100%",
          height: 844,
          background: "linear-gradient(160deg, #1A0F3C 0%, #2D1B69 50%, #0D1B2E 100%)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "52px 24px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setView("list")}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "rgba(176,156,224,0.7)", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Ses Kaydı
            </p>
            <p style={{ fontFamily: "Nunito", fontSize: 15, color: "white", margin: 0, fontWeight: 700 }}>
              Anne'nin Sesi
            </p>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 32 }}>
          {/* Text to read */}
          <div
            style={{
              padding: "20px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              width: "100%",
            }}
          >
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(176,156,224,0.7)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Okumanız için metin
            </p>
            <p
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                color: "rgba(255,255,255,0.9)",
                lineHeight: 1.7,
                margin: 0,
                fontStyle: "italic",
              }}
            >
              "Bir varmış bir yokmuş, çok uzak dağların ötesinde, yıldızların arasında küçük bir köy varmış. Bu köyde yaşayan çocuklar her gece gökyüzüne bakarlarmış. Onlar için her yıldız bir hikâyenin başlangıcıydı…"
            </p>
          </div>

          {/* Waveform */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 60, width: "100%" }}>
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className={recording ? "wave-bar" : ""}
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: recording ? "#9B7FD4" : "rgba(255,255,255,0.15)",
                  height: recording ? undefined : `${8 + Math.sin(i * 0.6) * 8}px`,
                }}
              />
            ))}
          </div>

          {/* Timer */}
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 48,
                fontWeight: 600,
                color: "white",
                margin: "0 0 4px",
                letterSpacing: "-0.02em",
              }}
            >
              {fmt(recordingTime)}
            </p>
            {recording && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F08B6E", animation: "pulse-soft 1s ease infinite" }} />
                <span style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Kaydediliyor</span>
              </div>
            )}
          </div>

          {/* Record button */}
          {!recording ? (
            <button
              onClick={startRecording}
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "#F08B6E",
                border: "4px solid rgba(240,139,110,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 8px 32px rgba(240,139,110,0.4)",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <div style={{ display: "flex", gap: 16 }}>
              <button
                onClick={stopRecording}
                style={{
                  padding: "16px 28px",
                  borderRadius: 16,
                  background: "white",
                  border: "none",
                  fontFamily: "Nunito",
                  fontSize: 15,
                  fontWeight: 800,
                  color: "var(--primary)",
                  cursor: "pointer",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                Kaydı Bitir
              </button>
              <button
                onClick={() => { setRecording(false); if (timerRef) clearInterval(timerRef); setRecordingTime(0) }}
                style={{
                  padding: "16px 20px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontFamily: "Nunito",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                }}
              >
                Baştan Al
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === "processing") {
    return (
      <div style={{ width: "100%", height: 844, background: "linear-gradient(160deg, #1A0F3C, #2D1B69, #0D1B2E)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(176,156,224,0.2)", display: "flex", alignItems: "center", justifyContent: "center", animation: "spin-slow 3s linear infinite" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#B09CE0" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="10" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, color: "white", margin: "0 0 8px" }}>Sesin hazırlanıyor…</h3>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "rgba(176,156,224,0.7)", margin: 0, fontWeight: 500 }}>Hazır olduğunda sana haber vereceğiz.</p>
        </div>
      </div>
    )
  }

  if (view === "success") {
    return (
      <div style={{ width: "100%", height: 844, background: "linear-gradient(160deg, #1A0F3C, #2D1B69, #0D1B2E)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", gap: 24 }}>
        {/* Confetti */}
        {["#FFD97D", "#F08B6E", "#8DB89A", "#B09CE0", "#F5C4A8"].map((c, i) => (
          <div key={i} style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: c, top: `${20 + i * 12}%`, left: `${15 + i * 16}%`, animation: `float ${2 + i * 0.4}s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
        ))}

        <div style={{ width: 100, height: 100, borderRadius: "50%", background: "rgba(141,184,154,0.2)", border: "2px solid rgba(141,184,154,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>
          🎉
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 700, color: "white", margin: "0 0 8px" }}>Anne'nin sesi hazır!</h2>
          <p style={{ fontFamily: "Nunito", fontSize: 15, color: "rgba(176,156,224,0.8)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
            Sesin hazır. Artık masalları sen anlatabilirsin.
          </p>
        </div>
        {/* Sample playback */}
        <div style={{ width: "100%", padding: "16px 20px", borderRadius: 16, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: 14 }}>
          <button style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--primary)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: "white", margin: "0 0 4px" }}>Ses örneği dinle</p>
            <div style={{ height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}><div style={{ width: "35%", height: "100%", background: "#B09CE0", borderRadius: 2 }} /></div>
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <button
            onClick={() => setView("list")}
            style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.4)" }}
          >
            Bu Sesi Kullan
          </button>
          <button
            onClick={() => { setView("recording"); setRecordingTime(0) }}
            style={{ width: "100%", padding: "16px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Yeniden Oluştur
          </button>
        </div>
      </div>
    )
  }

  // Voice list view
  return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)", paddingBottom: 40 }} className="screen-scroll">
      {/* Header */}
      <div style={{ padding: "52px 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>
            Ses Stüdyom
          </h1>
        </div>
        <div style={{ padding: "16px 20px", borderRadius: 16, background: "linear-gradient(135deg, rgba(176,156,224,0.15), rgba(124,92,191,0.1))", border: "1px solid rgba(124,92,191,0.2)" }}>
          <p style={{ fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px", lineHeight: 1.3 }}>
            "Ailenden bir ses,<br />her masalda yanında."
          </p>
          <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
            Kayıtlı sesler tüm hikâyelerinde kullanılabilir.
          </p>
        </div>
      </div>

      {/* Existing voices */}
      <div style={{ padding: "0 24px 24px" }}>
        <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Aile Sesleri
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Anne", name: "Annemin Sesi", date: "12 Temmuz 2026", emoji: "👩", ready: true },
            { label: "Baba", name: "Babamın Sesi", date: "5 Temmuz 2026", emoji: "👨", ready: true },
          ].map((voice) => (
            <div key={voice.label} style={{ padding: "16px 18px", borderRadius: 18, background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #F5C4A8, #F08B6E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                {voice.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{voice.label}</p>
                  <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "#8DB89A", background: "rgba(141,184,154,0.15)", borderRadius: 6, padding: "2px 8px" }}>Hazır</span>
                </div>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{voice.name} · {voice.date}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--secondary)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--primary)"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </button>
                <button style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--muted)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add voice */}
      <div style={{ padding: "0 24px" }}>
        <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Yeni Ses Ekle
        </p>
        <button
          onClick={() => setView("recording")}
          style={{
            width: "100%",
            padding: "18px",
            borderRadius: 18,
            background: "white",
            border: "2px dashed var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            🎙
          </div>
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--primary)", margin: "0 0 2px" }}>Ses Kaydı Oluştur</p>
            <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>Yaklaşık 60 saniye · Bir kez yeter</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
