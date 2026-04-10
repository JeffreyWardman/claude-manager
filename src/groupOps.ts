import type { PaneGroup, PaneLayout } from "./types";

export const SLOT_COUNTS: Record<PaneLayout, number> = {
	"1x1": 1,
	"2x1": 2,
	"1x2": 2,
	"2x2": 4,
	"3x1": 3,
	"1x3": 3,
	"3x2": 6,
	"2x3": 6,
	"2+1": 3,
	"1+2": 3,
	"3+1": 4,
	"1+3": 4,
};
const LAYOUT_ORDER: PaneLayout[] = [
	"1x1",
	"2x1",
	"1x2",
	"2+1",
	"1+2",
	"2x2",
	"3x1",
	"1x3",
	"3+1",
	"1+3",
	"3x2",
	"2x3",
];

/**
 * Drop a session onto a slot of the active group (from grid or sidebar drag).
 *
 * Rules:
 * - Session already in the target group → swap with the target slot (even if occupied)
 * - Session not in target group + target slot empty → add, remove from any source group
 * - Session not in target group + target slot occupied → do nothing
 */
function dropSessionToSlot(
	groups: PaneGroup[],
	targetGroupId: string,
	slotIdx: number,
	sessionId: string,
): PaneGroup[] {
	const targetGroup = groups.find((g) => g.id === targetGroupId);
	if (!targetGroup) {
		return groups;
	}

	const targetSlots = [...targetGroup.slots];
	const existingIdx = targetSlots.indexOf(sessionId);

	let added = false;
	if (existingIdx >= 0) {
		[targetSlots[existingIdx], targetSlots[slotIdx]] = [
			targetSlots[slotIdx],
			targetSlots[existingIdx],
		];
		added = true;
	} else if (targetSlots[slotIdx] === null) {
		targetSlots[slotIdx] = sessionId;
		added = true;
	}

	if (!added) {
		return groups;
	}

	const wasAlreadyHere = existingIdx >= 0;
	return groups
		.map((g) => {
			if (g.id === targetGroupId) {
				return { ...g, slots: targetSlots };
			}
			if (wasAlreadyHere) {
				return g;
			}
			const i = g.slots.indexOf(sessionId);
			if (i < 0) {
				return g;
			}
			const slots = [...g.slots];
			slots[i] = null;
			return { ...g, slots };
		})
		.filter((g) => g.slots.some((s) => s !== null));
}

export function dropToSlot(
	groups: PaneGroup[],
	activeGroupId: string,
	slotIdx: number,
	sessionId: string,
): PaneGroup[] {
	return dropSessionToSlot(groups, activeGroupId, slotIdx, sessionId);
}

export function dropToGroupSlot(
	groups: PaneGroup[],
	groupId: string,
	slotIdx: number,
	sessionId: string,
): PaneGroup[] {
	return dropSessionToSlot(groups, groupId, slotIdx, sessionId);
}

/**
 * Unconditional swap of two slots within the active group (pane-header drag).
 */
export function swapSlots(
	groups: PaneGroup[],
	activeGroupId: string,
	fromIdx: number,
	toIdx: number,
): PaneGroup[] {
	return groups.map((g) => {
		if (g.id !== activeGroupId) {
			return g;
		}
		const slots = [...g.slots];
		[slots[fromIdx], slots[toIdx]] = [slots[toIdx], slots[fromIdx]];
		return { ...g, slots };
	});
}

/**
 * Remove a session from every group slot it occupies.
 */
export function removeFromGroup(groups: PaneGroup[], sessionId: string): PaneGroup[] {
	return groups
		.map((g) => ({
			...g,
			slots: g.slots.map((s) => (s === sessionId ? null : s)),
		}))
		.filter((g) => g.slots.some((s) => s !== null));
}

/**
 * Add a session to the first empty slot in a group.
 * If the session is already in this group, does nothing.
 * If the group is full, expands to the next enabled layout with more slots.
 * Removes the session from any other group it was in.
 */
export function addToGroup(
	groups: PaneGroup[],
	groupId: string,
	sessionId: string,
	enabledLayouts?: PaneLayout[],
): PaneGroup[] {
	const targetGroup = groups.find((g) => g.id === groupId);
	if (!targetGroup) {
		return groups;
	}
	if (targetGroup.slots.includes(sessionId)) {
		return groups;
	}

	let firstEmpty = targetGroup.slots.indexOf(null);

	if (firstEmpty < 0 && enabledLayouts) {
		const currentSlots = SLOT_COUNTS[targetGroup.layout];
		const nextLayout = LAYOUT_ORDER.find(
			(l) => enabledLayouts.includes(l) && SLOT_COUNTS[l] > currentSlots,
		);
		if (nextLayout) {
			const newCount = SLOT_COUNTS[nextLayout];
			const expanded = Array.from({ length: newCount }, (_, i) => targetGroup.slots[i] ?? null);
			groups = groups.map((g) =>
				g.id === groupId ? { ...g, layout: nextLayout, slots: expanded } : g,
			);
			firstEmpty = expanded.indexOf(null);
		}
	}

	if (firstEmpty < 0) {
		return groups;
	}

	return dropToGroupSlot(groups, groupId, firstEmpty, sessionId);
}

/**
 * Null a specific slot index in the active group.
 */
export function removeFromSlot(
	groups: PaneGroup[],
	activeGroupId: string,
	slotIdx: number,
): PaneGroup[] {
	return groups
		.map((g) => {
			if (g.id !== activeGroupId) {
				return g;
			}
			const slots = [...g.slots];
			slots[slotIdx] = null;
			return { ...g, slots };
		})
		.filter((g) => g.slots.some((s) => s !== null));
}
