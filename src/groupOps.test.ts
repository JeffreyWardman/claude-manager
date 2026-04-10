import { describe, expect, it } from "vitest";
import {
	addToGroup,
	dropToGroupSlot,
	dropToSlot,
	removeFromGroup,
	removeFromSlot,
	swapSlots,
} from "./groupOps";
import type { PaneGroup, PaneLayout } from "./types";

// ─── Helpers ───────────────────────────────────────────────────────────────

function slots(g: PaneGroup): (string | null)[] {
	return g.slots;
}

function makeGroup(id: string, slotValues: (string | null)[], layout?: PaneLayout): PaneGroup {
	const l: PaneLayout =
		layout ?? (slotValues.length <= 1 ? "1x1" : slotValues.length <= 2 ? "2x1" : "2x2");
	return { id, name: id, layout: l, slots: slotValues };
}

// ─── dropToSlot ────────────────────────────────────────────────────────────

describe("dropToSlot", () => {
	it("adds an unassigned session to an empty slot in the active group", () => {
		const groups = [makeGroup("A", [null, null])];
		const result = dropToSlot(groups, "A", 0, "s1");
		expect(slots(result[0])).toEqual(["s1", null]);
	});

	it("does nothing when the target slot is occupied and session is not in the group", () => {
		const groups = [makeGroup("A", ["s2", null])];
		const result = dropToSlot(groups, "A", 0, "s1");
		expect(slots(result[0])).toEqual(["s2", null]);
	});

	it("moves a session within the active group to an empty slot (swap with null)", () => {
		const groups = [makeGroup("A", ["s1", null])];
		const result = dropToSlot(groups, "A", 1, "s1");
		expect(slots(result[0])).toEqual([null, "s1"]);
	});

	it("swaps two occupied slots within the active group", () => {
		const groups = [makeGroup("A", ["s1", "s2"])];
		const result = dropToSlot(groups, "A", 0, "s2");
		expect(slots(result[0])).toEqual(["s2", "s1"]);
	});

	it("moves session from another group to an empty slot, removing it from source", () => {
		const groups = [makeGroup("A", ["s1", null]), makeGroup("B", [null, null])];
		const result = dropToSlot(groups, "B", 0, "s1");
		// Source group A had only s1; after removal its slots are all null so the group is pruned
		expect(result.find((g) => g.id === "A")).toBeUndefined();
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s1", null]);
	});

	it("does nothing when dragging from another group to an occupied slot", () => {
		const groups = [makeGroup("A", ["s1", null]), makeGroup("B", ["s2", null])];
		const result = dropToSlot(groups, "B", 0, "s1");
		expect(slots(result.find((g) => g.id === "A")!)).toEqual(["s1", null]);
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s2", null]);
	});

	it("returns groups unchanged when activeGroupId does not exist", () => {
		const groups = [makeGroup("A", ["s1", null])];
		const result = dropToSlot(groups, "nonexistent", 0, "s1");
		expect(result).toEqual(groups);
	});
});

// ─── dropToGroupSlot ───────────────────────────────────────────────────────

describe("dropToGroupSlot", () => {
	it("adds an unassigned session to an empty group slot", () => {
		const groups = [makeGroup("A", [null, null])];
		const result = dropToGroupSlot(groups, "A", 1, "s1");
		expect(slots(result[0])).toEqual([null, "s1"]);
	});

	it("does nothing when the target slot is occupied and session is not in the group", () => {
		const groups = [makeGroup("A", ["s2", null])];
		const result = dropToGroupSlot(groups, "A", 0, "s1");
		expect(slots(result[0])).toEqual(["s2", null]);
	});

	it("moves session within the same group to an empty slot", () => {
		const groups = [makeGroup("A", ["s1", null])];
		const result = dropToGroupSlot(groups, "A", 1, "s1");
		expect(slots(result[0])).toEqual([null, "s1"]);
	});

	it("swaps two occupied slots within the same group", () => {
		const groups = [makeGroup("A", ["s1", "s2"])];
		const result = dropToGroupSlot(groups, "A", 0, "s2");
		expect(slots(result[0])).toEqual(["s2", "s1"]);
	});

	it("moves session from group A to group B empty slot, removing from group A", () => {
		const groups = [makeGroup("A", ["s1", "s2"]), makeGroup("B", [null, null])];
		const result = dropToGroupSlot(groups, "B", 0, "s1");
		expect(slots(result.find((g) => g.id === "A")!)).toEqual([null, "s2"]);
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s1", null]);
	});

	it("does nothing when dragging from group A to occupied slot in group B", () => {
		const groups = [makeGroup("A", ["s1", null]), makeGroup("B", ["s2", null])];
		const result = dropToGroupSlot(groups, "B", 0, "s1");
		expect(slots(result.find((g) => g.id === "A")!)).toEqual(["s1", null]);
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s2", null]);
	});

	it("removes session from all other groups when moving to a new group", () => {
		// Session in multiple groups shouldn't happen in normal use but the
		// operation should still clean up all occurrences.
		const groups = [
			makeGroup("A", ["s1", null]),
			makeGroup("B", ["s1", null]), // duplicate (corrupted state)
			makeGroup("C", [null, null]),
		];
		const result = dropToGroupSlot(groups, "C", 0, "s1");
		// A and B become all-null after s1 removed, so they are pruned
		expect(result.find((g) => g.id === "A")).toBeUndefined();
		expect(result.find((g) => g.id === "B")).toBeUndefined();
		expect(slots(result.find((g) => g.id === "C")!)).toEqual(["s1", null]);
	});

	it("returns groups unchanged when groupId does not exist", () => {
		const groups = [makeGroup("A", ["s1", null])];
		const result = dropToGroupSlot(groups, "nonexistent", 0, "s1");
		expect(result).toEqual(groups);
	});
});

// ─── swapSlots ────────────────────────────────────────────────────────────

describe("swapSlots", () => {
	it("swaps two occupied slots unconditionally", () => {
		const groups = [makeGroup("A", ["s1", "s2"])];
		const result = swapSlots(groups, "A", 0, 1);
		expect(slots(result[0])).toEqual(["s2", "s1"]);
	});

	it("swaps an occupied slot with a null slot", () => {
		const groups = [makeGroup("A", ["s1", null])];
		const result = swapSlots(groups, "A", 0, 1);
		expect(slots(result[0])).toEqual([null, "s1"]);
	});

	it("does not affect other groups", () => {
		const groups = [makeGroup("A", ["s1", "s2"]), makeGroup("B", ["s3", "s4"])];
		const result = swapSlots(groups, "A", 0, 1);
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s3", "s4"]);
	});

	it("is a no-op when swapping a slot with itself", () => {
		const groups = [makeGroup("A", ["s1", "s2"])];
		const result = swapSlots(groups, "A", 1, 1);
		expect(slots(result[0])).toEqual(["s1", "s2"]);
	});
});

// ─── removeFromGroup ───────────────────────────────────────────────────────

describe("removeFromGroup", () => {
	it("removes session from every group slot it occupies", () => {
		const groups = [makeGroup("A", ["s1", "s2"]), makeGroup("B", ["s1", null])];
		const result = removeFromGroup(groups, "s1");
		expect(slots(result.find((g) => g.id === "A")!)).toEqual([null, "s2"]);
		// B had only s1, so it's pruned
		expect(result.find((g) => g.id === "B")).toBeUndefined();
	});

	it("leaves groups unchanged if session is not present anywhere", () => {
		const groups = [makeGroup("A", ["s2", null])];
		const result = removeFromGroup(groups, "s1");
		expect(slots(result[0])).toEqual(["s2", null]);
	});
});

// ─── addToGroup ────────────────────────────────────────────────────────────

describe("addToGroup", () => {
	it("adds a session to the first empty slot", () => {
		const groups = [makeGroup("A", [null, null])];
		const result = addToGroup(groups, "A", "s1");
		expect(slots(result[0])).toEqual(["s1", null]);
	});

	it("fills the first empty slot even if a later slot is also empty", () => {
		const groups = [makeGroup("A", ["s2", null, null, null], "2x2")];
		const result = addToGroup(groups, "A", "s1");
		expect(slots(result[0])).toEqual(["s2", "s1", null, null]);
	});

	it("removes session from source group when moving to another group", () => {
		const groups = [makeGroup("A", ["s1", "s2"]), makeGroup("B", [null, null])];
		const result = addToGroup(groups, "B", "s1");
		expect(slots(result.find((g) => g.id === "A")!)).toEqual([null, "s2"]);
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s1", null]);
	});

	it("does nothing if the session is already in the target group", () => {
		const groups = [makeGroup("A", ["s1", null])];
		const result = addToGroup(groups, "A", "s1");
		expect(result).toBe(groups); // same reference — no change
	});

	it("does nothing if the group is full and no enabled layouts provided", () => {
		const groups = [makeGroup("A", ["s1", "s2"])];
		const result = addToGroup(groups, "A", "s3");
		expect(slots(result[0])).toEqual(["s1", "s2"]);
	});

	it("expands to the next enabled layout when the group is full", () => {
		const groups = [makeGroup("A", ["s1"], "1x1")];
		const enabled: PaneLayout[] = ["1x1", "2x1", "2x2"];
		const result = addToGroup(groups, "A", "s2", enabled);
		expect(result[0].layout).toBe("2x1");
		expect(slots(result[0])).toEqual(["s1", "s2"]);
	});

	it("skips disabled layouts when expanding", () => {
		const groups = [makeGroup("A", ["s1"], "1x1")];
		const enabled: PaneLayout[] = ["1x1", "2x2"];
		const result = addToGroup(groups, "A", "s2", enabled);
		expect(result[0].layout).toBe("2x2");
		expect(slots(result[0])).toEqual(["s1", "s2", null, null]);
	});

	it("does nothing if the group is full and no larger layout is enabled", () => {
		const groups = [makeGroup("A", ["s1", "s2"], "2x1")];
		const enabled: PaneLayout[] = ["1x1", "2x1"];
		const result = addToGroup(groups, "A", "s3", enabled);
		expect(result[0].layout).toBe("2x1");
		expect(slots(result[0])).toEqual(["s1", "s2"]);
	});

	it("preserves existing slots when expanding layout", () => {
		const groups = [makeGroup("A", ["s1", "s2"], "2x1")];
		const enabled: PaneLayout[] = ["1x1", "2x1", "2x2"];
		const result = addToGroup(groups, "A", "s3", enabled);
		expect(result[0].layout).toBe("2x2");
		expect(slots(result[0])).toEqual(["s1", "s2", "s3", null]);
	});

	it("does nothing if groupId does not exist", () => {
		const groups = [makeGroup("A", [null, null])];
		const result = addToGroup(groups, "nonexistent", "s1");
		expect(result).toEqual(groups);
	});
});

// ─── removeFromSlot ────────────────────────────────────────────────────────

describe("removeFromSlot", () => {
	it("nulls the specified slot in the active group", () => {
		const groups = [makeGroup("A", ["s1", "s2"])];
		const result = removeFromSlot(groups, "A", 0);
		expect(slots(result[0])).toEqual([null, "s2"]);
	});

	it("does not affect other groups", () => {
		const groups = [makeGroup("A", ["s1", "s2"]), makeGroup("B", ["s3", "s4"])];
		const result = removeFromSlot(groups, "A", 1);
		expect(slots(result.find((g) => g.id === "B")!)).toEqual(["s3", "s4"]);
	});

	it("is a no-op when the slot is already null", () => {
		const groups = [makeGroup("A", [null, "s2"])];
		const result = removeFromSlot(groups, "A", 0);
		expect(slots(result[0])).toEqual([null, "s2"]);
	});
});
