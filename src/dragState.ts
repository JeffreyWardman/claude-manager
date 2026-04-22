export type DragPayload =
	| { type: "session"; sessionId: string }
	| { type: "pane"; paneIdx: number }
	| { type: "group"; groupId: string }
	| null;

let current: DragPayload = null;

export function setDragPayload(payload: DragPayload) {
	current = payload;
}
export function getDragPayload() {
	return current;
}
export function clearDragPayload() {
	current = null;
}
