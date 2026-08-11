import { useState, useEffect, useRef } from "react"

interface Props {
  onBack: () => void
}

export default function AudioPlayer({ onBack }: Props) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0.28)
  const [speed, setSpeed] = useState("1x")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => Math.min(p + 0.002, 1))
      }, 100)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  const totalSeconds = 6 * 60
  const elapsed = Math.floor(progress * totalSeconds)
  const remaining = totalSeconds - elapsed
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

  const speeds = ["0.8x", "1x", "1.2x"]

  return (
    <div
      style={{
        width: "100%",
        height: 844,
        background: "var(--night-bg)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: -100,
          left: "50%",
          transform: "translateX(-50%)",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,92,191,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 100,
          right: -80,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,127,181,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Stars */}
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: i % 4 === 0 ? 3 : 2,
            height: i % 4 === 0 ? 3 : 2,
            borderRadius: "50%",
            background: "white",
            opacity: 0.15 + (i % 5) * 0.08,
            top: `${(i * 41 + 5) % 100}%`,
            left: `${(i * 67 + 9) % 100}%`,
            animation: `pulse-soft ${2 + (i % 3)}s ease infinite`,
            animationDelay: `${(i * 0.5) % 3}s`,
          }}
        />
      ))}

      {/* Header */}
      <div
        style={{
          padding: "52px 24px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--night-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 600, color: "var(--night-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Şimdi dinliyorsun
          </p>
        </div>

        <button
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--night-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      {/* Cover art */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "40px 0 36px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 32,
            background: "linear-gradient(160deg, #2D1B69, #7C5CBF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 88,
            boxShadow: "0 24px 64px rgba(124,92,191,0.5), 0 0 0 1px rgba(176,156,224,0.15)",
            animation: playing ? "float 3s ease-in-out infinite" : "none",
          }}
        >
          ⭐
        </div>
      </div>

      {/* Title area */}
      <div style={{ padding: "0 32px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 24,
            fontWeight: 600,
            color: "var(--night-text)",
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          Ege ve Kayıp Yıldız
        </h2>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🎙</span>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--night-purple)", margin: 0, fontWeight: 600 }}>
            Anne'nin sesiyle
          </p>
        </div>
      </div>

      {/* Waveform visual */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, padding: "24px 0 0", position: "relative", zIndex: 1 }}>
        {Array.from({ length: 28 }).map((_, i) => (
          <div
            key={i}
            className={playing ? "wave-bar" : ""}
            style={{
              width: 3,
              borderRadius: 2,
              background: i / 28 < progress
                ? "rgba(176,156,224,0.8)"
                : "rgba(255,255,255,0.15)",
              height: playing ? 8 : `${8 + Math.sin(i * 0.8) * 12 + 4}px`,
              transition: "height 0.2s ease",
            }}
          />
        ))}
      </div>

      {/* Progress slider */}
      <div style={{ padding: "20px 32px 0", position: "relative", zIndex: 1 }}>
        <div
          style={{
            height: 4,
            background: "rgba(255,255,255,0.12)",
            borderRadius: 2,
            position: "relative",
            cursor: "pointer",
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setProgress((e.clientX - rect.left) / rect.width)
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, var(--night-purple), rgba(176,156,224,0.6))",
              borderRadius: 2,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -6,
                top: -5,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--night-muted)", fontWeight: 500 }}>
            {fmt(elapsed)}
          </span>
          <span style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--night-muted)", fontWeight: 500 }}>
            -{fmt(remaining)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          padding: "28px 0 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* 15s back */}
        <button
          onClick={() => setProgress((p) => Math.max(0, p - 15 / totalSeconds))}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--night-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-3.35" />
            <text x="8" y="16" fontSize="6" fill="var(--night-text)" fontFamily="Nunito" fontWeight="700">15</text>
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={() => setPlaying(!playing)}
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 8px 32px rgba(124,92,191,0.5)",
          }}
        >
          {playing ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          )}
        </button>

        {/* 15s forward */}
        <button
          onClick={() => setProgress((p) => Math.min(1, p + 15 / totalSeconds))}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--night-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-.49-3.35" />
            <text x="8" y="16" fontSize="6" fill="var(--night-text)" fontFamily="Nunito" fontWeight="700">15</text>
          </svg>
        </button>
      </div>

      {/* Speed + Sleep timer */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          padding: "24px 32px 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              background: speed === s ? "rgba(176,156,224,0.2)" : "transparent",
              border: `1px solid ${speed === s ? "rgba(176,156,224,0.5)" : "rgba(255,255,255,0.1)"}`,
              color: speed === s ? "var(--night-purple)" : "var(--night-muted)",
              fontFamily: "Nunito",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {s}
          </button>
        ))}

        <button
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--night-muted)",
            fontFamily: "Nunito",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Zamanlayıcı
        </button>
      </div>

      {/* Show text toggle */}
      <div style={{ display: "flex", justifyContent: "center", padding: "20px 0 0", position: "relative", zIndex: 1 }}>
        <button
          style={{
            background: "none",
            border: "none",
            color: "var(--night-muted)",
            fontFamily: "Nunito",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 10,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Metni göster
        </button>
      </div>
    </div>
  )
}
