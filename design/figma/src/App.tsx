import { useState } from "react"
import BottomNav from "./components/BottomNav"
import Splash from "./screens/Splash"
import Onboarding from "./screens/Onboarding"
import Home from "./screens/Home"
import StoryCreation from "./screens/StoryCreation"
import StoryGenerating from "./screens/StoryGenerating"
import StoryResult from "./screens/StoryResult"
import AudioPlayer from "./screens/AudioPlayer"
import Library from "./screens/Library"
import VoiceStudio from "./screens/VoiceStudio"
import Profile from "./screens/Profile"

type Screen =
  | "splash"
  | "onboarding"
  | "home"
  | "create"
  | "generating"
  | "result"
  | "player"
  | "library"
  | "voice"
  | "profile"

type Tab = "home" | "library" | "create" | "profile"

const TAB_SCREENS: Record<Tab, Screen> = {
  home: "home",
  library: "library",
  create: "create",
  profile: "profile",
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash")
  const [activeTab, setActiveTab] = useState<Tab>("home")

  const showNav =
    screen === "home" ||
    screen === "library" ||
    screen === "profile"

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setScreen(TAB_SCREENS[tab])
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2C2825",
        padding: "20px 0",
      }}
    >
      {/* Phone shell */}
      <div
        className="phone-shell"
        style={{
          width: 390,
          minHeight: 844,
          borderRadius: 48,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* Status bar */}
        {screen !== "splash" && screen !== "onboarding" && screen !== "player" && screen !== "generating" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 44,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 28px",
              zIndex: 100,
              background: "transparent",
              pointerEvents: "none",
            }}
          >
            <span style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>9:41</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <svg width="15" height="11" viewBox="0 0 15 11" fill="var(--foreground)">
                <rect x="0" y="4" width="3" height="7" rx="1" opacity="0.4" />
                <rect x="4" y="2" width="3" height="9" rx="1" opacity="0.6" />
                <rect x="8" y="0" width="3" height="11" rx="1" opacity="0.8" />
                <rect x="12" y="0" width="3" height="11" rx="1" />
              </svg>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4.5C3.67 2 6.5 1 8 1c1.5 0 4.33 1 7 3.5" opacity="0.4" />
                <path d="M3 7c1.33-1.33 3-2 5-2s3.67.67 5 2" opacity="0.6" />
                <path d="M5 9.5C5.83 8.67 6.83 8.25 8 8.25s2.17.42 3 1.25" />
                <circle cx="8" cy="11" r="1" fill="var(--foreground)" />
              </svg>
              <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                <div style={{ width: 25, height: 12, borderRadius: 3, border: "1.5px solid var(--foreground)", display: "flex", alignItems: "center", padding: "1px" }}>
                  <div style={{ width: "80%", height: "100%", background: "var(--foreground)", borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Screens */}
        {screen === "splash" && <Splash onDone={() => setScreen("onboarding")} />}

        {screen === "onboarding" && <Onboarding onDone={() => setScreen("home")} />}

        {screen === "home" && (
          <Home
            onCreateStory={() => { setActiveTab("create"); setScreen("create") }}
            onOpenStory={() => setScreen("result")}
          />
        )}

        {screen === "library" && (
          <Library onOpenStory={() => setScreen("result")} />
        )}

        {screen === "profile" && (
          <Profile onVoiceStudio={() => setScreen("voice")} />
        )}

        {screen === "create" && (
          <StoryCreation
            onBack={() => { setActiveTab("home"); setScreen("home") }}
            onGenerate={() => setScreen("generating")}
          />
        )}

        {screen === "generating" && (
          <StoryGenerating onDone={() => setScreen("result")} />
        )}

        {screen === "result" && (
          <StoryResult
            onListen={() => setScreen("player")}
            onBack={() => setScreen(activeTab === "create" ? "home" : "library")}
          />
        )}

        {screen === "player" && (
          <AudioPlayer onBack={() => setScreen("result")} />
        )}

        {screen === "voice" && (
          <VoiceStudio onBack={() => setScreen("profile")} />
        )}

        {/* Bottom Nav */}
        {showNav && (
          <BottomNav
            active={activeTab}
            onChange={handleTabChange}
          />
        )}
      </div>

      {/* Screen label for desktop context */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 600,
        }}
      >
        {(
          [
            { s: "splash", label: "Splash" },
            { s: "onboarding", label: "Onboarding" },
            { s: "home", label: "Ana Sayfa" },
            { s: "create", label: "Yeni Hikâye" },
            { s: "generating", label: "Oluşturuluyor" },
            { s: "result", label: "Hikâye Hazır" },
            { s: "player", label: "Oynatıcı" },
            { s: "library", label: "Kütüphane" },
            { s: "voice", label: "Ses Stüdyosu" },
            { s: "profile", label: "Profil" },
          ] as const
        ).map(({ s, label }) => (
          <button
            key={s}
            onClick={() => {
              setScreen(s as Screen)
              if (s === "home" || s === "library" || s === "profile") {
                setActiveTab(s as Tab)
              }
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: screen === s ? "rgba(176,156,224,0.9)" : "rgba(255,255,255,0.08)",
              border: "none",
              color: screen === s ? "#2C2825" : "rgba(255,255,255,0.5)",
              fontFamily: "Nunito, sans-serif",
              fontSize: 11,
              fontWeight: screen === s ? 800 : 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
