import { useState } from "react";
import { useTheme } from "../ThemeContext";

interface Props {
  onClose: () => void;
}

type Tab = "preferences" | "hotkeys" | "about";

const HOTKEYS = [
  { keys: "⌘K", desc: "Command palette" },
  { keys: "⌘P", desc: "Settings" },
  { keys: "⌘N", desc: "New session" },
  { keys: "⌘W", desc: "Archive session" },
  { keys: "⌘B", desc: "Toggle sidebar" },
  { keys: "↑ / ↓", desc: "Navigate sessions" },
  { keys: "Enter", desc: "Rename selected" },
  { keys: "1–9", desc: "Jump to session" },
];

export function Settings({ onClose }: Props) {
  const { theme, allThemes, setThemeId } = useTheme();
  const [tab, setTab] = useState<Tab>("preferences");

  const tabStyle = (t: Tab) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: tab === t ? 600 : 400,
    color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
    padding: "4px 8px",
    borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
    fontFamily: "inherit",
  });

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
          width: "60vh",
          height: "60vh",
          padding: "20px 24px 24px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Settings</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          <button style={tabStyle("preferences")} onClick={() => setTab("preferences")}>Preferences</button>
          <button style={tabStyle("hotkeys")} onClick={() => setTab("hotkeys")}>Hotkeys</button>
          <button style={tabStyle("about")} onClick={() => setTab("about")}>About</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {tab === "preferences" && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>
              THEME
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {allThemes.map((t) => {
                const isActive = t.id === theme.id;
                const palette = [t.terminal.red, t.terminal.green, t.terminal.yellow, t.terminal.blue, t.terminal.magenta, t.terminal.cyan] as string[];
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
                    <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                      {palette.map((c, i) => (
                        <div key={i} style={{ width: 9, height: 9, borderRadius: 2, background: c }} />
                      ))}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ height: 2, borderRadius: 1, background: t.text.primary, width: "60%", marginBottom: 3, opacity: 0.8 }} />
                      <div style={{ height: 2, borderRadius: 1, background: t.text.muted, width: "40%" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: t.text.primary }}>{t.name}</span>
                      {isActive && <span style={{ fontSize: 10, color: t.accent }}>✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "hotkeys" && (
          <div>
            {HOTKEYS.map(({ keys, desc }) => (
              <div
                key={keys}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}
              >
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{desc}</span>
                <kbd style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "var(--bg-main)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontFamily: "inherit",
                }}>
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        )}

        {tab === "about" && (
          <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>claude-manager</div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: "var(--text-muted)" }}>Version </span>0.1.0
            </div>
            <p style={{ marginBottom: 12 }}>
              A macOS desktop app for managing multiple Claude Code sessions side by side.
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 11 }}>
              MIT License — Jeffrey Wardman
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
