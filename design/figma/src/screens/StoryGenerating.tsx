import { useState, useEffect } from "react"

interface Props {
  onDone: () => void
}

const messages = [
  "Hikâyenin kahramanı hazırlanıyor…",
  "Biraz yıldız tozu ekliyoruz…",
  "Sihirli sözcükler seçiliyor…",
  "Masalın renkleri belirleniyor…",
  "Son dokunuşlar yapılıyor…",
  "Masalın hazır! ✨",
]

export default function StoryGenerating({ onDone }: Props) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => {
        const next = Math.min(prev + 1, messages.length - 1)
        return next
      })
      setProgress((prev) => Math.min(prev + 16, 100))
    }, 1000)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      onDone()
    }, 6500)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [onDone])

  return (
    <div
      style={{
        width: "100%",
        minHeight: 844,
        background: "linear-gradient(160deg, #1A0F3C 0%, #2D1B69 50%, #0D1B2E 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 32px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Stars */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 2,
            height: 2,
            borderRadius: "50%",
            background: "white",
            opacity: 0.3 + (i % 4) * 0.15,
            top: `${(i * 43 + 9) % 100}%`,
            left: `${(i * 67 + 13) % 100}%`,
            animation: `pulse-soft ${1.5 + (i % 3) * 0.8}s ease infinite`,
            animationDelay: `${(i * 0.4) % 2}s`,
          }}
        />
      ))}

      {/* Central book illustration */}
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: 36,
          background: "rgba(176,156,224,0.15)",
          border: "1px solid rgba(176,156,224,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 40,
          animation: "float 3s ease-in-out infinite",
          backdropFilter: "blur(8px)",
          position: "relative",
        }}
      >
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <path d="M40 14C35 9 23 8 12 11v38c11-3 21-2 28 2V14z" fill="rgba(255,220,150,0.5)" stroke="rgba(255,220,150,0.8)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M40 14C45 9 57 8 68 11v38c-11-3-21-2-28 2V14z" fill="rgba(176,156,224,0.4)" stroke="rgba(176,156,224,0.8)" strokeWidth="1.5" strokeLinejoin="round" />
          <line x1="40" y1="14" x2="40" y2="53" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          {/* Animated sparkle */}
          <circle cx="24" cy="30" r="2.5" fill="rgba(255,220,150,0.9)" className="animate-pulse-soft" />
          <circle cx="56" cy="26" r="2" fill="rgba(176,156,224,1)" className="animate-pulse-soft" style={{ animationDelay: "0.5s" }} />
          <path d="M53 36l1.5 3.5 3.5 0.5-2.5 2.5 0.5 3.5-3-1.5-3 1.5 0.5-3.5-2.5-2.5 3.5-0.5z" fill="rgba(255,220,150,0.8)" />
        </svg>

        {/* Orbiting dot */}
        <div
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#FFD97D",
            top: -5,
            left: "50%",
            transformOrigin: "5px 75px",
            animation: "spin-slow 4s linear infinite",
            boxShadow: "0 0 12px rgba(255,217,125,0.8)",
          }}
        />
      </div>

      {/* Messages */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <p
          key={msgIndex}
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 22,
            fontWeight: 500,
            color: "white",
            margin: "0 0 12px",
            animation: "fadeUp 0.5s ease both",
            lineHeight: 1.4,
            minHeight: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {messages[msgIndex]}
        </p>
        <p
          style={{
            fontFamily: "Nunito, sans-serif",
            fontSize: 14,
            color: "rgba(176,156,224,0.7)",
            margin: 0,
            fontWeight: 500,
          }}
        >
          Ege ve Kayıp Yıldız hazırlanıyor
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 280 }}>
        <div
          style={{
            height: 4,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #9B7FD4, #FFD97D)",
              borderRadius: 2,
              transition: "width 0.8s ease",
            }}
          />
        </div>
      </div>

      {/* Background notice */}
      <p
        style={{
          position: "absolute",
          bottom: 60,
          fontFamily: "Nunito, sans-serif",
          fontSize: 13,
          color: "rgba(255,255,255,0.35)",
          textAlign: "center",
          padding: "0 32px",
          lineHeight: 1.5,
        }}
      >
        Uygulamadan ayrılsan da masalın oluşturulmaya devam eder.
      </p>
    </div>
  )
}
