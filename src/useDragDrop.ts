import { useEffect, useRef, useState } from "react";
import { clearDragPayload, getDragPayload, setDragPayload } from "./dragState";

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
				if (!source) {
					return;
				}

				const dragType = source.getAttribute("data-drag")!;
				const label = source.getAttribute("data-drag-label") || "";
				labelRef.current = label;

				if (dragType === "session") {
					setDragPayload({
						type: "session",
						sessionId: source.getAttribute("data-drag-id")!,
					});
				} else if (dragType === "pane") {
					setDragPayload({
						type: "pane",
						paneIdx: parseInt(source.getAttribute("data-drag-idx")!, 10),
					});
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
				if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) {
					return;
				}
				isDraggingRef.current = true;
				setIsDragging(true);
				document.body.style.userSelect = "none";
				document.body.style.webkitUserSelect = "none";
				document.body.classList.add("dragging");
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
			if (!startPos.current) {
				return;
			}

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
			document.body.classList.remove("dragging");

			const payload = getDragPayload();
			clearDragPayload();
			if (!payload) {
				return;
			}

			const target = findDropTarget(e.clientX, e.clientY);
			if (!target) {
				return;
			}

			const dropType = target.getAttribute("data-drop");
			const handlers = handlersRef.current;

			if (dropType === "group-slot" && payload.type === "session") {
				const groupId = target.getAttribute("data-group-id")!;
				const slotIdx = parseInt(target.getAttribute("data-slot-idx")!, 10);
				handlers.onDropToGroupSlot(groupId, slotIdx, payload.sessionId);
				handlers.onActivateGroupAtSlot(groupId, slotIdx);
			} else if (dropType === "group-header" && payload.type === "session") {
				const groupId = target.getAttribute("data-group-id")!;
				handlers.onAddToGroup(groupId, payload.sessionId);
				handlers.onActivateGroupAtSlot(groupId, 0);
			} else if (dropType === "new-group" && payload.type === "session") {
				handlers.onCreateGroupWithSession(payload.sessionId);
			} else if (dropType === "ungroup" && payload.type === "session") {
				handlers.onRemoveFromGroup(payload.sessionId);
			} else if (dropType === "session" && payload.type === "session") {
				const targetSessionId = target.getAttribute("data-session-id")!;
				if (targetSessionId !== payload.sessionId) {
					handlers.onCreateGroupFromSessions(payload.sessionId, targetSessionId);
				}
			} else if (dropType === "grid-slot" && payload.type === "session") {
				const gridIdx = parseInt(target.getAttribute("data-grid-idx")!, 10);
				handlers.onDropToGridSlot(gridIdx, payload.sessionId);
			} else if (dropType === "grid-slot" && payload.type === "pane") {
				const gridIdx = parseInt(target.getAttribute("data-grid-idx")!, 10);
				if (gridIdx !== payload.paneIdx) {
					handlers.onSwapGridSlots(payload.paneIdx, gridIdx);
				}
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
