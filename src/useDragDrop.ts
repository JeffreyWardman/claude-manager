import { useEffect, useRef, useState } from "react";
import { getDragPayload, setDragPayload, clearDragPayload } from "./dragState";

const DRAG_THRESHOLD = 5;

interface DragDropHandlers {
  onDropToGroupSlot: (groupId: string, slotIdx: number, sessionId: string) => void;
  onAddToGroup: (groupId: string, sessionId: string) => void;
  onRemoveFromGroup: (sessionId: string) => void;
  onCreateGroupFromSessions: (a: string, b: string) => void;
  onCreateGroupWithSession: (sessionId: string) => void;
  onDropToGridSlot: (slotIdx: number, sessionId: string) => void;
  onSwapGridSlots: (fromIdx: number, toIdx: number) => void;
  onActivateGroupAtSlot: (groupId: string, slotIdx: number) => void;
}

function findDropTarget(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest("[data-drop]") ?? null;
}

function findDragSource(el: Element | null): Element | null {
  return el?.closest("[data-drag]") ?? null;
}

export function useDragDrop(handlers: DragDropHandlers) {
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef("");
  const lastTarget = useRef<Element | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    // No pointerdown listener — clicks are completely unaffected.
    // Drag detection starts in pointermove when button is held.

    function onPointerMove(e: PointerEvent) {
      // Only track when primary button is held
      if (!(e.buttons & 1)) {
        if (startPos.current) {
          // Button released without pointerup (edge case) — cleanup
          startPos.current = null;
          clearDragPayload();
        }
        return;
      }

      // First move with button held — try to identify a drag source
      if (!startPos.current) {
        const source = findDragSource(e.target as Element);
        if (!source) return;

        const dragType = source.getAttribute("data-drag")!;
        const label = source.getAttribute("data-drag-label") || "";
        labelRef.current = label;

        if (dragType === "session") {
          setDragPayload({ type: "session", sessionId: source.getAttribute("data-drag-id")! });
        } else if (dragType === "pane") {
          setDragPayload({ type: "pane", paneIdx: parseInt(source.getAttribute("data-drag-idx")!) });
        } else {
          return;
        }

        startPos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Threshold check
      if (!isDraggingRef.current) {
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        isDraggingRef.current = true;
        setIsDragging(true);
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
        const ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.textContent = labelRef.current;
        document.body.appendChild(ghost);
        ghostRef.current = ghost;
      }

      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX + 12}px`;
        ghostRef.current.style.top = `${e.clientY + 12}px`;
      }

      const target = findDropTarget(e.clientX, e.clientY);
      if (target !== lastTarget.current) {
        lastTarget.current?.classList.remove("drag-over");
        target?.classList.add("drag-over");
        lastTarget.current = target ?? null;
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (!startPos.current) return;

      if (!isDraggingRef.current) {
        startPos.current = null;
        clearDragPayload();
        return;
      }

      // Full cleanup for actual drags
      lastTarget.current?.classList.remove("drag-over");
      lastTarget.current = null;
      ghostRef.current?.remove();
      ghostRef.current = null;
      isDraggingRef.current = false;
      startPos.current = null;
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";

      const payload = getDragPayload();
      clearDragPayload();
      if (!payload) return;

      const target = findDropTarget(e.clientX, e.clientY);
      if (!target) return;

      const dropType = target.getAttribute("data-drop");
      const h = handlersRef.current;

      if (dropType === "group-slot" && payload.type === "session") {
        const gid = target.getAttribute("data-group-id")!;
        const si = parseInt(target.getAttribute("data-slot-idx")!);
        h.onDropToGroupSlot(gid, si, payload.sessionId);
        h.onActivateGroupAtSlot(gid, si);
      } else if (dropType === "group-header" && payload.type === "session") {
        const gid = target.getAttribute("data-group-id")!;
        h.onAddToGroup(gid, payload.sessionId);
        h.onActivateGroupAtSlot(gid, 0);
      } else if (dropType === "new-group" && payload.type === "session") {
        h.onCreateGroupWithSession(payload.sessionId);
      } else if (dropType === "ungroup" && payload.type === "session") {
        h.onRemoveFromGroup(payload.sessionId);
      } else if (dropType === "session" && payload.type === "session") {
        const sid = target.getAttribute("data-session-id")!;
        if (sid !== payload.sessionId) h.onCreateGroupFromSessions(payload.sessionId, sid);
      } else if (dropType === "grid-slot" && payload.type === "session") {
        const gi = parseInt(target.getAttribute("data-grid-idx")!);
        h.onDropToGridSlot(gi, payload.sessionId);
      } else if (dropType === "grid-slot" && payload.type === "pane") {
        const gi = parseInt(target.getAttribute("data-grid-idx")!);
        if (gi !== payload.paneIdx) h.onSwapGridSlots(payload.paneIdx, gi);
      }
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return { isDragging };
}
