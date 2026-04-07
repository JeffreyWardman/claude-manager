import type { PaneGroup } from "./types";

/**
 * Drop a session onto a slot of the active group (from grid or sidebar drag).
 *
 * Rules:
 * - Session already in the target group → swap with the target slot (even if occupied)
 * - Session not in target group + target slot empty → add, remove from any source group
 * - Session not in target group + target slot occupied → do nothing
 */
export function dropToSlot(
  groups: PaneGroup[],
  activeGroupId: string,
  slotIdx: number,
  sessionId: string,
): PaneGroup[] {
  const targetGroup = groups.find((g) => g.id === activeGroupId);
  if (!targetGroup) return groups;

  const targetSlots = [...targetGroup.slots];
  const existingIdx = targetSlots.indexOf(sessionId);

  let added = false;
  if (existingIdx >= 0) {
    [targetSlots[existingIdx], targetSlots[slotIdx]] = [targetSlots[slotIdx], targetSlots[existingIdx]];
    added = true;
  } else if (targetSlots[slotIdx] === null) {
    targetSlots[slotIdx] = sessionId;
    added = true;
  }

  if (!added) return groups;

  const wasAlreadyHere = existingIdx >= 0;
  return groups.map((g) => {
    if (g.id === activeGroupId) return { ...g, slots: targetSlots };
    if (wasAlreadyHere) return g;
    const i = g.slots.indexOf(sessionId);
    if (i < 0) return g;
    const slots = [...g.slots];
    slots[i] = null;
    return { ...g, slots };
  });
}

/**
 * Drop a session onto a specific group's slot (sidebar group-slot drop target).
 * Same rules as dropToSlot but the target group is identified by groupId, not activeGroupId.
 */
export function dropToGroupSlot(
  groups: PaneGroup[],
  groupId: string,
  slotIdx: number,
  sessionId: string,
): PaneGroup[] {
  const targetGroup = groups.find((g) => g.id === groupId);
  if (!targetGroup) return groups;

  const targetSlots = [...targetGroup.slots];
  const existingIdx = targetSlots.indexOf(sessionId);

  let added = false;
  if (existingIdx >= 0) {
    [targetSlots[existingIdx], targetSlots[slotIdx]] = [targetSlots[slotIdx], targetSlots[existingIdx]];
    added = true;
  } else if (targetSlots[slotIdx] === null) {
    targetSlots[slotIdx] = sessionId;
    added = true;
  }

  if (!added) return groups;

  const wasAlreadyHere = existingIdx >= 0;
  return groups.map((g) => {
    if (g.id === groupId) return { ...g, slots: targetSlots };
    if (wasAlreadyHere) return g;
    const i = g.slots.indexOf(sessionId);
    if (i < 0) return g;
    const slots = [...g.slots];
    slots[i] = null;
    return { ...g, slots };
  });
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
    if (g.id !== activeGroupId) return g;
    const slots = [...g.slots];
    [slots[fromIdx], slots[toIdx]] = [slots[toIdx], slots[fromIdx]];
    return { ...g, slots };
  });
}

/**
 * Remove a session from every group slot it occupies.
 */
export function removeFromGroup(groups: PaneGroup[], sessionId: string): PaneGroup[] {
  return groups.map((g) => ({
    ...g,
    slots: g.slots.map((s) => (s === sessionId ? null : s)),
  }));
}

/**
 * Add a session to the first empty slot in a group.
 * If the session is already in this group, does nothing.
 * If no empty slot exists, does nothing.
 * Removes the session from any other group it was in.
 */
export function addToGroup(groups: PaneGroup[], groupId: string, sessionId: string): PaneGroup[] {
  const targetGroup = groups.find((g) => g.id === groupId);
  if (!targetGroup) return groups;
  if (targetGroup.slots.includes(sessionId)) return groups; // already here

  const firstEmpty = targetGroup.slots.indexOf(null);
  if (firstEmpty < 0) return groups; // group is full

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
  return groups.map((g) => {
    if (g.id !== activeGroupId) return g;
    const slots = [...g.slots];
    slots[slotIdx] = null;
    return { ...g, slots };
  });
}
