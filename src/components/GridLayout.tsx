import { useRef } from "react";
import type { ClaudeSession, PaneGroup } from "../types";
import type { ActivityState } from "../hooks/usePtyActivity";
import { MainPane } from "./MainPane";

const GRID_TEMPLATES: Record<string, React.CSSProperties> = {
  "1x1": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr", gridTemplateAreas: '"a"' },
  "2x1": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr", gridTemplateAreas: '"a b"' },
  "1x2": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a" "b"' },
  "2x2": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a b" "c d"' },
  "3x1": { gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr", gridTemplateAreas: '"a b c"' },
  "1x3": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr 1fr", gridTemplateAreas: '"a" "b" "c"' },
  "3x2": { gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a b c" "d e f"' },
  "2x3": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr 1fr", gridTemplateAreas: '"a b" "c d" "e f"' },
  // Asymmetric: wide spanning pane
  "2+1": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a b" "c c"' },
  "1+2": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a a" "b c"' },
  "3+1": { gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a b c" "d d d"' },
  "1+3": { gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a a a" "b c d"' },
};
const AREA_NAMES = ["a", "b", "c", "d", "e", "f"];

interface Props {
  group: PaneGroup | null;
  sessions: ClaudeSession[];
  focusedIdx: number;
  hoveredIdx?: number | null;
  onFocus: (idx: number) => void;
  onRemoveFromSlot: (idx: number) => void;
  dndActive: boolean;
  activityMap: Map<string, ActivityState>;
  unreadSessions: Set<string>;
}

export function GridLayout({ group, sessions, focusedIdx, hoveredIdx, onFocus, onRemoveFromSlot, dndActive, activityMap, unreadSessions }: Props) {
  const lastKnown = useRef<Map<string, ClaudeSession>>(new Map());

  if (!group) {
    return (
      <div
        data-tauri-drag-region
        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-very-muted)" }}
      >
        <div style={{ fontSize: 32, pointerEvents: "none" }}>◆</div>
        <div style={{ fontSize: 13, pointerEvents: "none" }}>No group selected</div>
        <div style={{ fontSize: 11, pointerEvents: "none" }}>Create a group in the sidebar</div>
      </div>
    );
  }

  const multiPane = group.slots.length > 1;

  return (
    <div
      role="region"
      aria-label={`Pane grid — ${group.layout} layout`}
      style={{
        flex: 1,
        display: "grid",
        ...GRID_TEMPLATES[group.layout],
        gap: 4,
        padding: 4,
        overflow: "hidden",
        background: "var(--border)",
      }}
    >
      {group.slots.map((sessionId, idx) => {
        const isFocused = idx === focusedIdx && multiPane;
        const isHovered = idx === hoveredIdx && multiPane && !(isFocused && sessionId);

        if (!sessionId) {
          return (
            <div
              key={`slot-${idx}`}
              role="button"
              tabIndex={0}
              aria-label={`Empty pane slot ${idx + 1}`}
              data-drop="grid-slot"
              data-grid-idx={idx}
              style={{
                gridArea: AREA_NAMES[idx],
                background: "var(--bg-main)",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                color: "var(--text-very-muted)",
                transition: "background 0.1s",
                position: "relative",
              }}
              onMouseDown={() => onFocus(idx)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus(idx); } }}
            >
              {isHovered && (
                <div style={{ position: "absolute", inset: 0, border: "2px solid var(--accent)", borderRadius: 6, zIndex: 5, pointerEvents: "none", opacity: 0.4 }} />
              )}
              <div style={{ fontSize: 24, color: "var(--text-muted)", pointerEvents: "none" }}>+</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>Drop session here</div>
            </div>
          );
        }

        const found = sessions.find((s) => s.session_id === sessionId) ?? null;
        if (found) lastKnown.current.set(sessionId, found);
        const session = found ?? lastKnown.current.get(sessionId) ?? null;

        return (
          <div
            key={sessionId}
            style={{
              gridArea: AREA_NAMES[idx],
              position: "relative",
              overflow: "hidden",
              background: "var(--bg-main)",
              borderRadius: 6,
            }}
            onMouseDown={() => onFocus(idx)}
          >
            {(isFocused || isHovered) && (
              <div style={{ position: "absolute", inset: 0, border: `2px solid var(--accent)`, borderRadius: 6, zIndex: 5, pointerEvents: "none", opacity: isHovered ? 0.4 : 1 }} />
            )}
            <MainPane
              session={session}
              gridSlotIdx={multiPane ? idx : undefined}
              onGridClose={multiPane ? () => onRemoveFromSlot(idx) : undefined}
              activityMap={activityMap}
              unreadSessions={unreadSessions}
              focused={idx === focusedIdx}
            />
            {/* Overlay: sits above xterm canvas so pointer-based DnD can detect grid slots.
                Only rendered while a drag is in progress to avoid blocking terminal interaction. */}
            {dndActive && (
              <div
                data-drop="grid-slot"
                data-grid-idx={idx}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  background: "transparent",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
