import { useRef } from "react";
import type { ClaudeSession, PaneGroup } from "../types";
import { MainPane } from "./MainPane";
import type { DragPayload } from "../dragState";

const GRID_TEMPLATES: Record<string, React.CSSProperties> = {
  "1x1": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr", gridTemplateAreas: '"a"' },
  "2x1": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr", gridTemplateAreas: '"a b"' },
  "1x2": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a" "b"' },
  "2x2": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: '"a b" "c d"' },
};
const AREA_NAMES = ["a", "b", "c", "d"];

interface Props {
  group: PaneGroup | null;
  sessions: ClaudeSession[];
  focusedIdx: number;
  onFocus: (idx: number) => void;
  onRemoveFromSlot: (idx: number) => void;
  startDrag: (e: React.PointerEvent, payload: DragPayload, label: string) => void;
  dndActive: boolean;
}

export function GridLayout({ group, sessions, focusedIdx, onFocus, onRemoveFromSlot, startDrag, dndActive }: Props) {
  const lastKnown = useRef<Map<string, ClaudeSession>>(new Map());

  if (!group) {
    return (
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-very-muted)" }}
      >
        <div style={{ fontSize: 32 }}>◆</div>
        <div style={{ fontSize: 13 }}>No group selected</div>
        <div style={{ fontSize: 11 }}>Create a group in the sidebar</div>
      </div>
    );
  }

  const multiPane = group.slots.length > 1;

  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        ...GRID_TEMPLATES[group.layout],
        gap: 0,
        overflow: "hidden",
      }}
    >
      {group.slots.map((sessionId, idx) => {
        const isFocused = idx === focusedIdx && multiPane;

        if (!sessionId) {
          return (
            <div
              key={`slot-${idx}`}
              data-drop="grid-slot"
              data-grid-idx={idx}
              style={{
                gridArea: AREA_NAMES[idx],
                background: "var(--bg-main)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                color: "var(--text-very-muted)",
                outline: isFocused ? "2px solid var(--accent)" : "1px solid var(--border)",
                outlineOffset: "-1px",
                transition: "background 0.1s",
              }}
              onMouseDown={() => onFocus(idx)}
            >
              <div style={{ fontSize: 24, opacity: 0.2, pointerEvents: "none" }}>+</div>
              <div style={{ fontSize: 11, opacity: 0.2, pointerEvents: "none" }}>Drop session here</div>
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
              outline: isFocused ? "2px solid var(--accent)" : "1px solid var(--border)",
              outlineOffset: "-1px",
            }}
            onMouseDown={() => onFocus(idx)}
          >
            <MainPane
              session={session}
              gridSlotIdx={multiPane ? idx : undefined}
              onGridClose={multiPane ? () => onRemoveFromSlot(idx) : undefined}
              startDrag={startDrag}
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
