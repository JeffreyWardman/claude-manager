import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessions } from "./hooks/useSessions";
import { usePtyActivity } from "./hooks/usePtyActivity";
import type { ActivityState } from "./hooks/usePtyActivity";
import { Sidebar } from "./components/Sidebar";
import { GridLayout } from "./components/GridLayout";
import { MainPane } from "./components/MainPane";
import { CommandPalette } from "./components/CommandPalette";
import { NewSessionModal } from "./components/NewSessionModal";
import { Settings } from "./components/Settings";
import { ThemeProvider } from "./ThemeContext";
import type { ClaudeSession, PaneGroup, PaneLayout } from "./types";
import { dropToSlot, dropToGroupSlot, swapSlots, removeFromGroup, removeFromSlot, addToGroup } from "./groupOps";
import { useDragDrop } from "./useDragDrop";

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 480;

const SLOT_COUNTS: Record<PaneLayout, number> = { "1x1": 1, "2x1": 2, "1x2": 2, "2x2": 4 };

function genId() { return Math.random().toString(36).slice(2, 10); }

function loadGroups(): PaneGroup[] {
  try {
    const saved = localStorage.getItem("pane-groups");
    if (saved) return JSON.parse(saved);
    // Migrate from old grid-sessions format
    const old: string[] = JSON.parse(localStorage.getItem("grid-sessions") ?? "[]");
    if (old.length > 0) {
      const layout: PaneLayout = old.length <= 1 ? "1x1" : old.length <= 2 ? "2x1" : "2x2";
      const count = SLOT_COUNTS[layout];
      const slots = Array.from({ length: count }, (_, i) => old[i] ?? null);
      return [{ id: genId(), name: "Group 1", layout, slots }];
    }
  } catch {}
  return [];
}

function AppInner() {
  const { sessions, loading, refresh } = useSessions();
  const activityMap = usePtyActivity(sessions.map((s) => s.session_id));

  const [groups, setGroups] = useState<PaneGroup[]>(loadGroups);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    () => localStorage.getItem("active-group-id") ?? null
  );
  const [focusedSlotIdx, setFocusedSlotIdx] = useState(0);
  const [standaloneSelectedId, setStandaloneSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem("sidebar-visible") !== "false"
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    () => parseInt(localStorage.getItem("sidebar-width") ?? "240")
  );

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null;

  // Ensure activeGroupId tracks groups[0] when groups change
  useEffect(() => {
    if (!activeGroupId && groups.length > 0) {
      const id = groups[0].id;
      setActiveGroupId(id);
      localStorage.setItem("active-group-id", id);
    }
  }, [groups, activeGroupId]);

  // Keep focusedSlotIdx in bounds
  useEffect(() => {
    const max = (activeGroup?.slots.length ?? 1) - 1;
    if (focusedSlotIdx > max) setFocusedSlotIdx(0);
  }, [activeGroup?.slots.length, focusedSlotIdx]);

  // Remove archived/deleted sessions from all group slots
  useEffect(() => {
    if (sessions.length === 0) return;
    const ids = new Set(sessions.map((s) => s.session_id));
    const needsUpdate = groups.some((g) => g.slots.some((s) => s !== null && !ids.has(s)));
    if (needsUpdate) {
      const next = groups.map((g) => ({ ...g, slots: g.slots.map((s) => (s && ids.has(s) ? s : null)) }));
      persistGroups(next);
    }
  }, [sessions]);

  function persistGroups(next: PaneGroup[]) {
    setGroups(next);
    localStorage.setItem("pane-groups", JSON.stringify(next));
  }

  function activateGroup(id: string) {
    setActiveGroupId(id);
    localStorage.setItem("active-group-id", id);
    setFocusedSlotIdx(0);
    setStandaloneSelectedId(null);
  }

  const handleActivateGroupAtSlot = useCallback((groupId: string, slotIdx: number) => {
    setActiveGroupId(groupId);
    localStorage.setItem("active-group-id", groupId);
    setStandaloneSelectedId(null);
    setFocusedSlotIdx(slotIdx);
  }, []);

  const handleCreateGroup = useCallback(() => {
    const id = genId();
    const group: PaneGroup = { id, name: `Group ${groups.length + 1}`, layout: "2x1", slots: [null, null] };
    persistGroups([...groups, group]);
    activateGroup(id);
  }, [groups]);

  const handleDeleteGroup = useCallback((id: string) => {
    const next = groups.filter((g) => g.id !== id);
    persistGroups(next);
    if (activeGroupId === id) {
      const newActive = next[0]?.id ?? null;
      setActiveGroupId(newActive);
      if (newActive) localStorage.setItem("active-group-id", newActive);
      else localStorage.removeItem("active-group-id");
    }
  }, [groups, activeGroupId]);

  const handleRenameGroup = useCallback((id: string, name: string) => {
    persistGroups(groups.map((g) => g.id === id ? { ...g, name } : g));
  }, [groups]);

  const handleChangeLayout = useCallback((id: string, layout: PaneLayout) => {
    const count = SLOT_COUNTS[layout];
    persistGroups(groups.map((g) => {
      if (g.id !== id) return g;
      const slots = Array.from({ length: count }, (_, i) => g.slots[i] ?? null);
      return { ...g, layout, slots };
    }));
  }, [groups]);

  const handleDropToSlot = useCallback((slotIdx: number, sessionId: string) => {
    if (!activeGroup) return;
    persistGroups(dropToSlot(groups, activeGroup.id, slotIdx, sessionId));
  }, [groups, activeGroup]);

  const handleDropToGroupSlot = useCallback((groupId: string, slotIdx: number, sessionId: string) => {
    persistGroups(dropToGroupSlot(groups, groupId, slotIdx, sessionId));
  }, [groups]);

  const handleSwapSlots = useCallback((fromIdx: number, toIdx: number) => {
    if (!activeGroup) return;
    persistGroups(swapSlots(groups, activeGroup.id, fromIdx, toIdx));
  }, [groups, activeGroup]);

  const handleRemoveFromSlot = useCallback((slotIdx: number) => {
    if (!activeGroup) return;
    persistGroups(removeFromSlot(groups, activeGroup.id, slotIdx));
  }, [groups, activeGroup]);

  const handleRemoveFromGroup = useCallback((sessionId: string) => {
    persistGroups(removeFromGroup(groups, sessionId));
  }, [groups]);

  const handleAddToGroup = useCallback((groupId: string, sessionId: string) => {
    persistGroups(addToGroup(groups, groupId, sessionId));
  }, [groups]);

  const handleCreateGroupWithSessionRef = useRef<(sid: string) => void>(() => {});
  const handleCreateGroupFromSessionsRef = useRef<(a: string, b: string) => void>(() => {});

  const { isDragging: dndActive } = useDragDrop({
    onDropToGroupSlot: handleDropToGroupSlot,
    onAddToGroup: handleAddToGroup,
    onRemoveFromGroup: handleRemoveFromGroup,
    onCreateGroupFromSessions: (a, b) => handleCreateGroupFromSessionsRef.current(a, b),
    onCreateGroupWithSession: (sid) => handleCreateGroupWithSessionRef.current(sid),
    onDropToGridSlot: handleDropToSlot,
    onSwapGridSlots: handleSwapSlots,
    onActivateGroupAtSlot: handleActivateGroupAtSlot,
  });
  const handleCreateGroupFromSessions = useCallback((sessionIdA: string, sessionIdB: string) => {
    const id = genId();
    const group: PaneGroup = {
      id,
      name: `Group ${groups.length + 1}`,
      layout: "2x1",
      slots: [sessionIdA, sessionIdB],
    };
    persistGroups([...groups, group]);
    activateGroup(id);
  }, [groups]);
  handleCreateGroupFromSessionsRef.current = handleCreateGroupFromSessions;

  const handleCreateGroupWithSession = useCallback((sessionId: string) => {
    const id = genId();
    const next = removeFromGroup(groups, sessionId);
    const group: PaneGroup = { id, name: `Group ${next.length + 1}`, layout: "2x1", slots: [sessionId, null] };
    persistGroups([...next, group]);
    activateGroup(id);
  }, [groups]);
  handleCreateGroupWithSessionRef.current = handleCreateGroupWithSession;

  const selectSession = useCallback((s: ClaudeSession) => {
    // If session is already in a group, focus that slot
    for (const group of groups) {
      const slotIdx = group.slots.indexOf(s.session_id);
      if (slotIdx >= 0) {
        handleActivateGroupAtSlot(group.id, slotIdx);
        return;
      }
    }
    // Session not in any group — just visually select it
    setActiveGroupId(null);
    localStorage.removeItem("active-group-id");
    setFocusedSlotIdx(0);
    setStandaloneSelectedId(s.session_id);
  }, [groups, activeGroup, focusedSlotIdx, handleActivateGroupAtSlot]);

  const selectedId = standaloneSelectedId ?? activeGroup?.slots[focusedSlotIdx] ?? null;

  const handleNewSession = useCallback((cwd: string) => {
    const tmpId = `new-${Date.now()}`;
    invoke("pty_spawn", { id: tmpId, cwd, rows: 24, cols: 80, resume: false, cmd: null })
      .then(() => refresh())
      .catch(console.error);
  }, [refresh]);

  // Flush pending renames when a session transitions to "waiting"
  const prevActivityRef = useRef<Map<string, ActivityState>>(new Map());
  useEffect(() => {
    const prev = prevActivityRef.current;
    for (const session of sessions) {
      const prevState = prev.get(session.session_id);
      const currState = activityMap.get(session.session_id);
      if (currState === "waiting" && prevState !== "waiting" && session.pending_rename) {
        const encoded = Array.from(new TextEncoder().encode(`/rename ${session.pending_rename}\r`));
        invoke("pty_write", { id: session.session_id, data: encoded })
          .then(() => invoke("clear_pending_rename", { sessionId: session.session_id }))
          .then(() => refresh())
          .catch(console.error);
      }
    }
    prevActivityRef.current = new Map(activityMap);
  }, [activityMap, sessions, refresh]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (mod && e.key === "p") { e.preventDefault(); setSettingsOpen((o) => !o); return; }
      if (mod && e.key === "b") {
        e.preventDefault();
        setSidebarVisible((v) => {
          localStorage.setItem("sidebar-visible", String(!v));
          return !v;
        });
        return;
      }
      if (mod && e.key === "n") { e.preventDefault(); setNewSessionOpen(true); return; }
      if (mod && e.key === "w") {
        e.preventDefault();
        if (selectedId) {
          invoke("archive_session", { sessionId: selectedId })
            .then(() => refresh())
            .catch(console.error);
        }
        return;
      }

      if (paletteOpen || settingsOpen) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key >= "1" && e.key <= "9" && !mod) {
        const target = sessions[parseInt(e.key) - 1];
        if (target) selectSession(target);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sessions, selectedId, paletteOpen, settingsOpen, selectSession]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMove(e: MouseEvent) {
      const w = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + e.clientX - startX));
      setSidebarWidth(w);
      localStorage.setItem("sidebar-width", String(w));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-very-muted)", fontSize: 12 }}>
        Loading sessions...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-main)" }}>
      {sidebarVisible && (
        <Sidebar
          sessions={sessions}
          selectedId={selectedId}
          groups={groups}
          activeGroupId={activeGroup?.id ?? null}
          activityMap={activityMap}
          width={sidebarWidth}
          onSelect={selectSession}
          onActivateGroup={activateGroup}
          onActivateGroupAtSlot={handleActivateGroupAtSlot}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={handleRenameGroup}
          onChangeLayout={handleChangeLayout}
          onRemoveFromGroup={handleRemoveFromGroup}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenNewSession={() => setNewSessionOpen(true)}
          onRefresh={refresh}
        />
      )}
      {sidebarVisible && (
        <div
          onMouseDown={startResize}
          style={{
            width: 4,
            cursor: "col-resize",
            flexShrink: 0,
            background: "var(--bg-sidebar)",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-sidebar)")}
        />
      )}
      {standaloneSelectedId ? (
        <MainPane session={sessions.find((s) => s.session_id === standaloneSelectedId) ?? null} />
      ) : (
        <GridLayout
          group={activeGroup}
          sessions={sessions}
          focusedIdx={focusedSlotIdx}
          onFocus={setFocusedSlotIdx}
          onRemoveFromSlot={handleRemoveFromSlot}
          dndActive={dndActive}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          sessions={sessions}
          onSelect={selectSession}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {newSessionOpen && (
        <NewSessionModal
          cwds={sessions.map((s) => s.cwd)}
          onConfirm={handleNewSession}
          onClose={() => setNewSessionOpen(false)}
        />
      )}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
