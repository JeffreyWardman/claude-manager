import { describe, it, expect } from "vitest";
import type { ActivityState } from "./hooks/usePtyActivity";

/**
 * Pure logic extracted from the activity/unread tracking in App.tsx and StatusDot.
 * Tests the state machine without React or Tauri dependencies.
 */

// ─── StatusDot indicator logic ──────────────────────────────────────────────

type Indicator = "computing" | "unread" | "waiting" | "active" | "offline";

function resolveIndicator(opts: {
  status: "active" | "offline";
  activity?: ActivityState;
  unread?: boolean;
  focused?: boolean;
}): Indicator {
  if (opts.activity === "computing") return "computing";
  if (opts.unread) return "unread";
  if (opts.activity === "waiting" && !opts.focused) return "waiting";
  return opts.status;
}

describe("StatusDot indicator resolution", () => {
  it("shows computing when activity is computing", () => {
    expect(resolveIndicator({ status: "active", activity: "computing" })).toBe("computing");
  });

  it("computing takes priority over unread", () => {
    expect(resolveIndicator({ status: "active", activity: "computing", unread: true })).toBe("computing");
  });

  it("shows unread when not computing and unread is set", () => {
    expect(resolveIndicator({ status: "active", activity: "waiting", unread: true })).toBe("unread");
  });

  it("shows waiting for unfocused pane with waiting activity", () => {
    expect(resolveIndicator({ status: "active", activity: "waiting", focused: false })).toBe("waiting");
  });

  it("suppresses waiting indicator for focused pane", () => {
    expect(resolveIndicator({ status: "active", activity: "waiting", focused: true })).toBe("active");
  });

  it("shows plain status when no activity", () => {
    expect(resolveIndicator({ status: "active" })).toBe("active");
    expect(resolveIndicator({ status: "offline" })).toBe("offline");
  });

  it("shows unread even when focused (user needs to interact to clear)", () => {
    expect(resolveIndicator({ status: "active", activity: "waiting", unread: true, focused: true })).toBe("unread");
  });
});

// ─── Unread state machine ───────────────────────────────────────────────────

interface UnreadState {
  unread: Set<string>;
  prevActivity: Map<string, ActivityState>;
}

function applyActivityChange(
  state: UnreadState,
  activityMap: Map<string, ActivityState>,
  selectedId: string | null,
): UnreadState {
  const unread = new Set(state.unread);
  for (const [id, activity] of activityMap) {
    if (activity === "waiting" && state.prevActivity.get(id) === "computing" && id !== selectedId) {
      unread.add(id);
    }
  }
  return { unread, prevActivity: new Map(activityMap) };
}

function applySelect(state: UnreadState, selectedId: string): UnreadState {
  if (!state.unread.has(selectedId)) return state;
  const unread = new Set(state.unread);
  unread.delete(selectedId);
  return { ...state, unread };
}

function applyInput(state: UnreadState, sessionId: string): UnreadState {
  if (!state.unread.has(sessionId)) return state;
  const unread = new Set(state.unread);
  unread.delete(sessionId);
  return { ...state, unread };
}

function freshState(): UnreadState {
  return { unread: new Set(), prevActivity: new Map() };
}

describe("unread state transitions", () => {
  it("marks session as unread when computing→waiting and not selected", () => {
    let state = freshState();
    state = applyActivityChange(state, new Map([["s1", "computing"]]), null);
    state = applyActivityChange(state, new Map([["s1", "waiting"]]), "s2");
    expect(state.unread.has("s1")).toBe(true);
  });

  it("does not mark selected session as unread", () => {
    let state = freshState();
    state = applyActivityChange(state, new Map([["s1", "computing"]]), "s1");
    state = applyActivityChange(state, new Map([["s1", "waiting"]]), "s1");
    expect(state.unread.has("s1")).toBe(false);
  });

  it("clears unread when session is selected", () => {
    let state = freshState();
    state = applyActivityChange(state, new Map([["s1", "computing"]]), null);
    state = applyActivityChange(state, new Map([["s1", "waiting"]]), "s2");
    expect(state.unread.has("s1")).toBe(true);
    state = applySelect(state, "s1");
    expect(state.unread.has("s1")).toBe(false);
  });

  it("clears unread when user types in the session", () => {
    let state = freshState();
    state = applyActivityChange(state, new Map([["s1", "computing"]]), null);
    state = applyActivityChange(state, new Map([["s1", "waiting"]]), "s2");
    expect(state.unread.has("s1")).toBe(true);
    state = applyInput(state, "s1");
    expect(state.unread.has("s1")).toBe(false);
  });

  it("does not mark unread on waiting→waiting (no transition)", () => {
    let state = freshState();
    state = applyActivityChange(state, new Map([["s1", "waiting"]]), "s2");
    state = applyActivityChange(state, new Map([["s1", "waiting"]]), "s2");
    expect(state.unread.has("s1")).toBe(false);
  });

  it("tracks multiple sessions independently", () => {
    let state = freshState();
    const both = new Map<string, ActivityState>([["s1", "computing"], ["s2", "computing"]]);
    state = applyActivityChange(state, both, "s1");
    // s1 finishes while s1 is selected, s2 finishes while s1 is still selected
    const done = new Map<string, ActivityState>([["s1", "waiting"], ["s2", "waiting"]]);
    state = applyActivityChange(state, done, "s1");
    expect(state.unread.has("s1")).toBe(false); // selected, not unread
    expect(state.unread.has("s2")).toBe(true);  // not selected, unread
  });

  it("selecting one session does not clear another's unread", () => {
    let state = freshState();
    state = applyActivityChange(state, new Map([["s1", "computing"], ["s2", "computing"]]), null);
    state = applyActivityChange(state, new Map([["s1", "waiting"], ["s2", "waiting"]]), null);
    expect(state.unread.has("s1")).toBe(true);
    expect(state.unread.has("s2")).toBe(true);
    state = applySelect(state, "s1");
    expect(state.unread.has("s1")).toBe(false);
    expect(state.unread.has("s2")).toBe(true);
  });
});
