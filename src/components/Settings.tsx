import { useTheme } from "../ThemeContext";

interface Props {
  onClose: () => void;
}

export function Settings({ onClose }: Props) {
  const { theme, allThemes, setThemeId } = useTheme();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-sidebar)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: 380,
          padding: "20px 24px 24px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Preferences
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "2px 4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            ×
          </button>
        </div>

        {/* Theme section */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            marginBottom: 10,
          }}
        >
          THEME
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {allThemes.map((t) => {
            const isActive = t.id === theme.id;
            const palette = [
              t.terminal.red,
              t.terminal.green,
              t.terminal.yellow,
              t.terminal.blue,
              t.terminal.magenta,
              t.terminal.cyan,
            ] as string[];
            return (
              <button
                key={t.id}
                onClick={() => setThemeId(t.id)}
                style={{
                  background: t.bg.main,
                  border: `1.5px solid ${isActive ? t.accent : t.border}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  outline: "none",
                  transition: "border-color 0.1s",
                }}
              >
                {/* Color swatches */}
                <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                  {palette.map((c, i) => (
                    <div
                      key={i}
                      style={{ width: 9, height: 9, borderRadius: 2, background: c }}
                    />
                  ))}
                </div>
                {/* Fake text lines */}
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      height: 2,
                      borderRadius: 1,
                      background: t.text.primary,
                      width: "60%",
                      marginBottom: 3,
                      opacity: 0.8,
                    }}
                  />
                  <div
                    style={{
                      height: 2,
                      borderRadius: 1,
                      background: t.text.muted,
                      width: "40%",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 500, color: t.text.primary }}>
                    {t.name}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 10, color: t.accent }}>✓</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
