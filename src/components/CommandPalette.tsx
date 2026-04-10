import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import type { ClaudeSession } from "../types";
import { StatusDot } from "./StatusDot";

interface Props {
  sessions: ClaudeSession[];
  onSelect: (session: ClaudeSession) => void;
  onClose: () => void;
}

function formatCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

export function CommandPalette({ sessions, onSelect, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const active = sessions.filter((s) => s.status === "active");

  const offline = sessions.filter((s) => s.status === "offline");

  const handleSelect = (sessionId: string) => {
    const session = sessions.find((s) => s.session_id === sessionId);
    if (session) {
      onSelect(session);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 120,
        background: "rgba(0,0,0,0.6)",
        zIndex: 50,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          background: "#1a1a1a",
          border: "1px solid #888888",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        <Command
          value={value}
          onValueChange={setValue}
          style={{ background: "transparent" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid #222",
            }}
          >
            <span style={{ color: "#8a8a8a", fontSize: 15 }}>⌕</span>
            <Command.Input
              ref={inputRef}
              aria-label="Search sessions"
              placeholder="Search sessions..."
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: "#ededef",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <span style={{ color: "#8a8a8a", fontSize: 11 }}>esc</span>
          </div>

          <Command.List
            style={{
              maxHeight: 360,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            <Command.Empty
              style={{ padding: "24px 14px", color: "#8a8a8a", fontSize: 13, textAlign: "center" }}
            >
              No sessions found.
            </Command.Empty>

            {active.length > 0 && (
              <Command.Group
                heading="ACTIVE"
                style={{ padding: "0" }}
              >
                {active.map((s) => (
                  <SessionItem key={s.session_id} session={s} onSelect={handleSelect} />
                ))}
              </Command.Group>
            )}


            {offline.length > 0 && (
              <Command.Group heading="OFFLINE">
                {offline.slice(0, 15).map((s) => (
                  <SessionItem key={s.session_id} session={s} onSelect={handleSelect} />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function SessionItem({
  session,
  onSelect,
}: {
  session: ClaudeSession;
  onSelect: (id: string) => void;
}) {
  const name = session.display_name || `${session.project_name}-${session.session_id.slice(0, 5)}`;
  return (
    <Command.Item
      value={`${name} ${session.cwd} ${session.git_branch ?? ""}`}
      onSelect={() => onSelect(session.session_id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        cursor: "pointer",
        fontSize: 13,
        color: "#9ca3af",
        outline: "none",
      }}
      data-selected-style={{
        background: "rgba(255,255,255,0.07)",
        color: "#ededef",
      }}
    >
      <StatusDot status={session.status} size={7} />
      <span style={{ flex: 1, fontWeight: 500, color: "#ededef" }}>{name}</span>
      <span style={{ fontSize: 11, color: "#8a8a8a" }}>{formatCwd(session.cwd)}</span>
      {session.git_branch && (
        <span
          style={{
            fontSize: 10,
            color: "#888888",
            maxWidth: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.git_branch}
        </span>
      )}
    </Command.Item>
  );
}
