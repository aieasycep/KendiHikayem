type Tab = "home" | "library" | "create" | "profile"

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const tabs = [
  {
    id: "home" as Tab,
    label: "Ana Sayfa",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    id: "library" as Tab,
    label: "Hikâyelerim",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
  },
  {
    id: "create" as Tab,
    label: "Oluştur",
    icon: (_active: boolean) => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    id: "profile" as Tab,
    label: "Profil",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

export default function BottomNav({ active, onChange }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: 390,
        background: "#FFFFFF",
        borderTop: "1px solid var(--border)",
        paddingBottom: 24,
        paddingTop: 8,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
      }}
    >
      {tabs.map((tab) => {
        const isCreate = tab.id === "create"
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: isCreate ? "0" : "4px 12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: isCreate ? "white" : isActive ? "var(--primary)" : "var(--muted-foreground)",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            {isCreate ? (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(124, 92, 191, 0.4)",
                  marginTop: -16,
                  color: "white",
                }}
              >
                {tab.icon(true)}
              </div>
            ) : (
              tab.icon(isActive)
            )}
            <span
              style={{
                fontSize: isCreate ? 11 : 10,
                fontWeight: isActive ? 700 : 500,
                fontFamily: "Nunito, sans-serif",
                letterSpacing: "0.01em",
                marginTop: isCreate ? 4 : 0,
                color: isCreate ? "var(--primary)" : undefined,
              }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
