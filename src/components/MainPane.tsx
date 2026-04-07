import { useState, useEffect } from "react";
import type { ClaudeSession } from "../types";
import { StatusDot } from "./StatusDot";
import { TerminalPane } from "./TerminalPane";
import type { DragPayload } from "../dragState";

interface Props {
  session: ClaudeSession | null;
  gridSlotIdx?: number;
  onGridClose?: () => void;
  startDrag?: (e: React.PointerEvent, payload: DragPayload, label: string) => void;
}

function formatCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

type View = "claude" | "terminal" | "split";

export function MainPane({ session, gridSlotIdx, onGridClose, startDrag }: Props) {
  const [view, setView] = useState<View>("claude");

  useEffect(() => {
    setView("claude");
  }, [session?.session_id]);

  if (!session) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 h-full"
        style={{ color: "var(--text-very-muted)" }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>◆</div>
        <div style={{ fontSize: 13 }}>Select a session</div>
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-very-muted)" }}>
          or press N to start a new one
        </div>
      </div>
    );
  }

  const shellId = `${session.session_id}-shell`;

  const tabStyle = (active: boolean) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: active ? 500 : 400,
    color: active ? "var(--text-secondary)" : "var(--text-muted)",
    padding: "0 8px",
    letterSpacing: "0.04em",
  });

  const showClaude = view === "claude" || view === "split";
  const showShell = view === "terminal" || view === "split";

  const inGrid = gridSlotIdx !== undefined;

  return (
    <div className="flex flex-col flex-1 h-full" style={{ background: "var(--bg-main)" }}>
      {/* Header */}
      <div
        {...(!inGrid ? { "data-tauri-drag-region": true } : {})}
        onPointerDown={inGrid && startDrag ? (e) => {
          const label = session.display_name || session.project_name;
          startDrag(e, { type: "pane", paneIdx: gridSlotIdx! }, label);
        } : undefined}
        className="flex items-center gap-2 px-4"
        style={{
          height: inGrid ? 36 : 52,
          paddingTop: inGrid ? 0 : 28,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          cursor: inGrid ? "grab" : undefined,
        }}
      >
        {inGrid && (
          <span style={{ fontSize: 10, color: "var(--text-very-muted)", userSelect: "none", marginRight: 2 }}>⠿</span>
        )}
        <StatusDot status={session.status} size={8} />
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
          {session.display_name || `${session.project_name}-${session.session_id.slice(0, 5)}`}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {formatCwd(session.cwd)}
        </span>
        {session.pid > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-very-muted)", marginLeft: 4 }}>
            pid {session.pid}
          </span>
        )}

        {/* View tabs */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <button
            style={tabStyle(view === "claude")}
            onClick={() => setView("claude")}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = view === "claude" ? "var(--text-secondary)" : "var(--text-muted)")}
          >
            CLAUDE
          </button>
          <span style={{ color: "var(--text-very-muted)", fontSize: 10 }}>|</span>
          <button
            style={tabStyle(view === "terminal")}
            onClick={() => setView("terminal")}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = view === "terminal" ? "var(--text-secondary)" : "var(--text-muted)")}
          >
            TERMINAL
          </button>
          <span style={{ color: "var(--text-very-muted)", fontSize: 10 }}>|</span>
          <button
            style={tabStyle(view === "split")}
            onClick={() => setView((v) => v === "split" ? "claude" : "split")}
            title="Split view"
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = view === "split" ? "var(--text-secondary)" : "var(--text-muted)")}
          >
            ⧉
          </button>
          {onGridClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onGridClose(); }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "var(--text-very-muted)",
                padding: "0 2px",
                marginLeft: 4,
                lineHeight: 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-very-muted)")}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {showClaude && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRight: showShell ? "1px solid var(--border)" : undefined,
            }}
          >
            <TerminalPane ptyId={session.session_id} cwd={session.cwd} />
          </div>
        )}
        {showShell && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <TerminalPane ptyId={shellId} cwd={session.cwd} cmd="/bin/zsh" />
          </div>
        )}
      </div>
    </div>
  );
}
