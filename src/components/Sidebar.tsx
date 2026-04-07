import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeSession, PaneGroup, PaneLayout } from "../types";
import { StatusDot } from "./StatusDot";
import type { ActivityState } from "../hooks/usePtyActivity";
import type { DragPayload } from "../dragState";

const ALL_LAYOUTS: PaneLayout[] = ["1x1", "2x1", "1x2", "2x2"];

interface Props {
  sessions: ClaudeSession[];
  selectedId: string | null;
  groups: PaneGroup[];
  activeGroupId: string | null;
  activityMap: Map<string, ActivityState>;
  width: number;
  onSelect: (session: ClaudeSession) => void;
  onActivateGroup: (id: string) => void;
  onActivateGroupAtSlot: (groupId: string, slotIdx: number) => void;
  onCreateGroup: () => void;
  onDeleteGroup: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onChangeLayout: (id: string, layout: PaneLayout) => void;
  onRemoveFromGroup: (sessionId: string) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onOpenNewSession: () => void;
  onRefresh: () => void;
  startDrag: (e: React.PointerEvent, payload: DragPayload, label: string) => void;
}

interface Group {
  label: string;
  sessions: ClaudeSession[];
}

type GroupMode = "status" | "location";
type StatusFilter = "all" | "active" | "offline";

interface ContextMenu {
  sessionId: string;
  x: number;
  y: number;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function projectLabel(cwd: string): string {
  const parts = cwd.replace(/\/$/, "").split("/");
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return parts[parts.length - 1] || cwd;
}

function groupByStatus(sessions: ClaudeSession[]): Group[] {
  const groups: Group[] = [
    { label: "ACTIVE", sessions: sessions.filter((s) => s.status === "active") },
    { label: "OFFLINE", sessions: sessions.filter((s) => s.status === "offline") },
  ];
  return groups.filter((g) => g.sessions.length > 0);
}

function groupByLocation(sessions: ClaudeSession[]): Group[] {
  const map = new Map<string, ClaudeSession[]>();
  for (const s of sessions) {
    const key = projectLabel(s.cwd);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries())
    .map(([label, sess]) => ({ label, sessions: sess }))
    .sort((a, b) => {
      const aActive = a.sessions.some((s) => s.status === "active") ? 0 : 1;
      const bActive = b.sessions.some((s) => s.status === "active") ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.label.localeCompare(b.label);
    });
}

// Tiny layout icon: renders a miniature grid preview
function LayoutIcon({ layout }: { layout: PaneLayout }) {
  const cell = { width: 5, height: 4, background: "currentColor", borderRadius: 1 } as React.CSSProperties;
  if (layout === "1x1") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1 }}>
      <div style={cell} />
    </div>
  );
  if (layout === "2x1") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
      <div style={cell} /><div style={cell} />
    </div>
  );
  if (layout === "1x2") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 1 }}>
      <div style={cell} /><div style={cell} />
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
      <div style={cell} /><div style={cell} /><div style={cell} /><div style={cell} />
    </div>
  );
}

export function Sidebar({
  sessions, selectedId, groups, activeGroupId, activityMap, width,
  onSelect, onActivateGroup, onActivateGroupAtSlot, onCreateGroup, onDeleteGroup, onRenameGroup,
  onChangeLayout, onRemoveFromGroup,
  onOpenPalette, onOpenSettings, onOpenNewSession, onRefresh, startDrag,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [groupsCollapsed, setGroupsCollapsed] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>(
    () => (localStorage.getItem("sidebar-group-mode") as GroupMode | null) ?? "status"
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (localStorage.getItem("sidebar-status-filter") as StatusFilter | null) ?? "all"
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  // Group-level state
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");
  const [layoutPickerGroupId, setLayoutPickerGroupId] = useState<string | null>(null);
  const [groupSlotContextMenu, setGroupSlotContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (renamingGroupId && renameGroupInputRef.current) {
      renameGroupInputRef.current.focus();
      renameGroupInputRef.current.select();
    }
  }, [renamingGroupId]);

  useEffect(() => {
    if (!contextMenu && !layoutPickerGroupId && !groupSlotContextMenu) return;
    const close = () => { setContextMenu(null); setLayoutPickerGroupId(null); setGroupSlotContextMenu(null); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu, layoutPickerGroupId, groupSlotContextMenu]);

  const cycleFilter = () =>
    setStatusFilter((f) => {
      const next = f === "all" ? "active" : f === "active" ? "offline" : "all";
      localStorage.setItem("sidebar-status-filter", next);
      return next;
    });

  const filteredSessions =
    statusFilter === "all" ? sessions : sessions.filter((s) => s.status === statusFilter);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (renamingId || renamingGroupId) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if ((e.target as HTMLElement)?.closest?.(".xterm")) return;
        e.preventDefault();
        const flatItems = filteredSessions;
        const idx = flatItems.findIndex((s) => s.session_id === selectedId);
        if (idx === -1) { if (flatItems[0]) onSelect(flatItems[0]); return; }
        const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
        const target = flatItems[Math.max(0, Math.min(flatItems.length - 1, next))];
        if (target) {
          onSelect(target);
          itemRefs.current.get(target.session_id)?.scrollIntoView({ block: "nearest" } as ScrollIntoViewOptions);
        }
      }
      if (e.key === "Enter" && selectedId) {
        if ((e.target as HTMLElement)?.closest?.(".xterm")) return;
        const session = sessions.find((s) => s.session_id === selectedId);
        if (session) startRename(session);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sessions, selectedId, onSelect, renamingId, renamingGroupId, filteredSessions]);

  function startRename(session: ClaudeSession) {
    setRenamingId(session.session_id);
    setRenameValue(session.display_name ?? session.project_name);
    setContextMenu(null);
  }

  async function commitRename(sessionId: string) {
    try {
      const trimmed = renameValue.trim();
      await invoke("rename_session", { sessionId, name: trimmed });
      if (trimmed && activityMap.get(sessionId) === "waiting") {
        await invoke("pty_write", { id: sessionId, data: Array.from(new TextEncoder().encode(`/rename ${trimmed}\r`)) });
        await invoke("clear_pending_rename", { sessionId });
      }
      onRefresh();
    } catch (e) { console.error(e); }
    setRenamingId(null);
  }

  function startRenameGroup(group: PaneGroup) {
    setRenamingGroupId(group.id);
    setRenameGroupValue(group.name);
  }

  function commitRenameGroup(id: string) {
    const trimmed = renameGroupValue.trim();
    if (trimmed) onRenameGroup(id, trimmed);
    setRenamingGroupId(null);
  }

  async function archiveSession(sessionId: string) {
    setContextMenu(null);
    try { await invoke("archive_session", { sessionId }); onRefresh(); } catch (e) { console.error(e); }
  }

  async function deleteSession(sessionId: string) {
    setContextMenu(null);
    try { await invoke("delete_session", { sessionId }); onRefresh(); } catch (e) { console.error(e); }
  }

  async function summarizeSession(session: ClaudeSession) {
    setContextMenu(null);
    try {
      const lines = await invoke<{ role: string; text: string; timestamp: string }[]>(
        "get_conversation", { cwd: session.cwd, sessionId: session.session_id }
      );
      const firstUser = lines.find((l) => l.role === "user");
      if (!firstUser) return;
      const summary = firstUser.text.trim().slice(0, 60).replace(/\n/g, " ");
      await invoke("rename_session", { sessionId: session.session_id, name: summary });
      onRefresh();
    } catch (e) { console.error(e); }
  }

  // Sessions assigned to any group are shown in the groups section — hide from sessions list
  const sessionsInGroups = new Set(
    groupsCollapsed ? [] : groups.flatMap((g) => g.slots.filter(Boolean) as string[])
  );
  const unassignedSessions = filteredSessions.filter((s) => !sessionsInGroups.has(s.session_id));
  const sessionGroups = groupMode === "status" ? groupByStatus(unassignedSessions) : groupByLocation(unassignedSessions);

  const iconBtn = {
    background: "none", border: "none", color: "var(--text-very-muted)", cursor: "pointer",
    fontSize: 13, lineHeight: 1, padding: "2px 4px", borderRadius: 4,
  } as React.CSSProperties;

  const sectionLabel = {
    fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)",
  } as React.CSSProperties;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", width, flexShrink: 0 }}
    >
      {/* Header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4"
        style={{ height: 52, paddingTop: 28, flexShrink: 0 }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          claude-manager
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={cycleFilter}
            title={`Filter: ${statusFilter}`}
            style={{ ...iconBtn, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: statusFilter !== "all" ? "var(--text-secondary)" : "var(--text-very-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = statusFilter !== "all" ? "var(--text-secondary)" : "var(--text-very-muted)")}
          >
            {statusFilter === "all" ? "ALL" : statusFilter === "active" ? "LIVE" : "OFF"}
          </button>
          <button
            onClick={() => setGroupMode((m) => { const next = m === "status" ? "location" : "status"; localStorage.setItem("sidebar-group-mode", next); return next; })}
            title={groupMode === "status" ? "Group by location" : "Group by status"}
            style={{ ...iconBtn, color: groupMode === "location" ? "var(--text-secondary)" : "var(--text-very-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = groupMode === "location" ? "var(--text-secondary)" : "var(--text-very-muted)")}
          >
            {groupMode === "status" ? "⌂" : "●"}
          </button>
          <button
            onClick={onOpenNewSession}
            title="New session (⌘N)"
            style={{ ...iconBtn, fontSize: 18, color: "var(--accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent)")}
          >
            +
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: 4 }}>

        {/* ── GROUPS SECTION ── */}
        <div style={{ padding: "0 4px 8px" }}>
          <div
            style={{ display: "flex", alignItems: "center", padding: "2px 8px", gap: 4 }}
          >
            <button
              onClick={() => setGroupsCollapsed((c) => !c)}
              style={{ ...sectionLabel, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, fontFamily: "inherit", flex: 1, textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              <span style={{ display: "inline-block", transform: groupsCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s", fontSize: 8 }}>▾</span>
              GROUPS
            </button>
            <button
              onClick={onCreateGroup}
              title="New group"
              style={{ ...iconBtn, fontSize: 15, color: "var(--text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              +
            </button>
          </div>

          {!groupsCollapsed && groups.map((group) => {
            const isActive = group.id === activeGroupId;
            const isCollapsedGroup = collapsed[group.id];
            const isRenamingGroup = renamingGroupId === group.id;
            const showLayoutPicker = layoutPickerGroupId === group.id;

            return (
              <div key={group.id} style={{ marginBottom: 2 }}>
                {/* Group header */}
                <div
                  data-drop="group-header"
                  data-group-id={group.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 28,
                    borderRadius: 5,
                    background: isActive ? "var(--item-selected)" : "none",
                    border: "1px solid transparent",
                    padding: "0 8px",
                    cursor: "pointer",
                    gap: 4,
                  }}
                  onClick={() => { if (!isRenamingGroup) onActivateGroup(group.id); }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--item-hover)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                  onDoubleClick={() => startRenameGroup(group)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] })); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-very-muted)", fontSize: 8, lineHeight: 1, flexShrink: 0 }}
                  >
                    <span style={{ display: "inline-block", transform: isCollapsedGroup ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s" }}>▾</span>
                  </button>

                  {isRenamingGroup ? (
                    <input
                      ref={renameGroupInputRef}
                      value={renameGroupValue}
                      onChange={(e) => setRenameGroupValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitRenameGroup(group.id); }
                        if (e.key === "Escape") { e.preventDefault(); setRenamingGroupId(null); }
                      }}
                      onBlur={() => commitRenameGroup(group.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1, background: "var(--bg-main)", border: "1px solid var(--accent)", borderRadius: 3, color: "var(--text-primary)", fontSize: 12, padding: "1px 4px", outline: "none", fontFamily: "inherit" }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 500 : 400, color: isActive ? "var(--text-primary)" : "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {group.name}
                    </span>
                  )}

                  {/* Layout picker button */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setLayoutPickerGroupId(showLayoutPicker ? null : group.id); }}
                      title="Change layout"
                      style={{ ...iconBtn, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-very-muted)", padding: "2px 5px", border: "1px solid var(--border)", borderRadius: 3 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-very-muted)")}
                    >
                      {group.layout}
                    </button>
                    {showLayoutPicker && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          right: 0,
                          background: "var(--bg-sidebar)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                          zIndex: 100,
                          padding: "6px",
                          display: "flex",
                          gap: 4,
                        }}
                      >
                        {ALL_LAYOUTS.map((l) => (
                          <button
                            key={l}
                            onClick={() => { onChangeLayout(group.id, l); setLayoutPickerGroupId(null); }}
                            title={l}
                            style={{
                              background: l === group.layout ? "var(--accent)" : "var(--bg-main)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              padding: "5px 6px",
                              cursor: "pointer",
                              color: l === group.layout ? "#fff" : "var(--text-muted)",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <LayoutIcon layout={l} />
                            <span style={{ fontSize: 8, letterSpacing: "0.02em", fontWeight: 600 }}>{l}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delete group */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }}
                    title="Remove group"
                    style={{ ...iconBtn, fontSize: 13, flexShrink: 0, color: "var(--text-very-muted)", opacity: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; e.currentTarget.style.color = "var(--text-very-muted)"; }}
                  >
                    ×
                  </button>
                </div>

                {/* Group slots */}
                {!isCollapsedGroup && (
                  <div style={{ paddingLeft: 16, paddingTop: 2 }}>
                    {group.slots.map((sessionId, slotIdx) => {
                      const session = sessionId ? sessions.find((s) => s.session_id === sessionId) ?? null : null;

                      return (
                        <div
                          key={slotIdx}
                          data-drop="group-slot"
                          data-group-id={group.id}
                          data-slot-idx={slotIdx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            height: 24,
                            borderRadius: 4,
                            padding: "0 8px",
                            gap: 6,
                            cursor: session ? "grab" : "default",
                            userSelect: "none",
                            transition: "all 0.1s",
                          }}
                          onPointerDown={session ? (e) => {
                            startDrag(e, { type: "session", sessionId: session.session_id }, session.display_name || session.project_name);
                          } : undefined}
                          onClick={() => { if (session) onActivateGroupAtSlot(group.id, slotIdx); }}
                          onContextMenu={session ? (e) => { e.preventDefault(); e.stopPropagation(); setGroupSlotContextMenu({ sessionId: session.session_id, x: e.clientX, y: e.clientY }); } : undefined}
                          onMouseEnter={(e) => { if (session) e.currentTarget.style.background = "var(--item-hover)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                        >
                          <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, flexShrink: 0, pointerEvents: "none" }}>{slotIdx + 1}</span>
                          {session ? (
                            <>
                              <StatusDot status={session.status} activity={activityMap.get(session.session_id)} size={5} />
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, pointerEvents: "none" }}>
                                {session.display_name || `${session.project_name}-${session.session_id.slice(0, 5)}`}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-very-muted)", fontStyle: "italic", pointerEvents: "none" }}>
                              empty
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {groups.length === 0 && !groupsCollapsed && (
            <div style={{ padding: "4px 12px 4px", fontSize: 11, color: "var(--text-very-muted)", fontStyle: "italic" }}>
              No groups yet — click + to create one
            </div>
          )}
        </div>

        {/* Ungroup drop zone */}
        <div
          data-drop="ungroup"
          style={{
            margin: "0 8px 8px",
            borderRadius: 4,
            height: 20,
            background: "transparent",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-very-muted)", fontWeight: 600, letterSpacing: "0.04em", pointerEvents: "none" }}>
            DROP TO UNGROUP
          </span>
        </div>

        {/* ── SESSIONS SECTION ── */}
        <div>
        {sessionGroups.map((group) => {
          const isCollapsed = collapsed[group.label];
          return (
            <div key={group.label}>
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                className="flex items-center gap-1 w-full px-4 py-1"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <span style={{ display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s", fontSize: 8, marginRight: 2 }}>▾</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{group.label}</span>
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{group.sessions.length}</span>
              </button>

              {!isCollapsed && group.sessions.map((session) => {
                const isSelected = session.session_id === selectedId;
                const isRenaming = renamingId === session.session_id;
                const name = session.display_name || `${session.project_name}-${session.session_id.slice(0, 5)}`;
                const activity = activityMap.get(session.session_id);
                const rowTint =
                  activity === "computing" ? "rgba(245,158,11,0.07)" :
                  activity === "waiting" ? "rgba(34,197,94,0.07)" : undefined;

                return (
                  <div
                    key={session.session_id}
                    ref={(el) => { if (el) itemRefs.current.set(session.session_id, el); else itemRefs.current.delete(session.session_id); }}
                    data-drop="session"
                    data-session-id={session.session_id}
                    onPointerDown={!isRenaming ? (e) => {
                      startDrag(e, { type: "session", sessionId: session.session_id }, name);
                    } : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      height: 30,
                      background: isSelected ? "var(--item-selected)" : rowTint ?? "none",
                      borderRadius: 4,
                      margin: "0 4px",
                      padding: "0 12px",
                      cursor: "grab",
                      userSelect: "none",
                      transition: "background 0.05s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = rowTint ?? "var(--item-hover)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = rowTint ?? "none"; }}
                    onClick={() => { if (!isRenaming) onSelect(session); }}
                    onDoubleClick={() => { if (!isRenaming) startRename(session); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ sessionId: session.session_id, x: e.clientX, y: e.clientY });
                      onSelect(session);
                    }}
                  >
                    <StatusDot status={session.status} activity={activity} size={7} />
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitRename(session.session_id); }
                          if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
                        }}
                        onBlur={() => commitRename(session.session_id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flex: 1, background: "var(--bg-main)", border: "1px solid var(--accent)", borderRadius: 3, color: "var(--text-primary)", fontSize: 13, padding: "1px 4px", outline: "none", fontFamily: "inherit" }}
                      />
                    ) : (
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isSelected ? 500 : 400, color: isSelected ? "var(--text-primary)" : "var(--text-secondary)", fontSize: 13 }}>
                        {name}
                      </span>
                    )}
                    {!isRenaming && session.git_branch && (
                      <span style={{ color: "var(--text-very-muted)", fontSize: 10, flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {session.project_name}/{session.git_branch}
                      </span>
                    )}
                    {!isRenaming && (
                      <span style={{ color: "var(--text-very-muted)", fontSize: 11, flexShrink: 0 }}>
                        {timeAgo(session.started_at)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div className="px-4 py-8 text-center" style={{ color: "var(--text-muted)", fontSize: 12 }}>
            No Claude Code sessions found.
            <br />
            <span style={{ fontSize: 11, marginTop: 4, display: "block" }}>Start one in your terminal.</span>
          </div>
        )}
        </div>{/* end sessions wrapper */}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 12px", gap: 12, height: 28, borderTop: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>
        <button onClick={onOpenPalette} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, padding: 0, fontFamily: "inherit" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>⌘K</button>
        <span>⌘N new</span>
        <span>⌘W close</span>
        <button onClick={onOpenSettings} title="Preferences (⌘P)" style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, padding: 0, fontFamily: "inherit" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>?</button>
      </div>

      {/* Group slot context menu */}
      {groupSlotContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: groupSlotContextMenu.x, top: groupSlotContextMenu.y, background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 1000, minWidth: 140, padding: "4px 0" }}
        >
          <button
            onClick={() => { onRemoveFromGroup(groupSlotContextMenu.sessionId); setGroupSlotContextMenu(null); }}
            style={{ display: "block", width: "100%", background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, textAlign: "left", padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--item-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            Remove from group
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (() => {
        const session = sessions.find((s) => s.session_id === contextMenu.sessionId);
        if (!session) return null;
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 1000, minWidth: 140, padding: "4px 0" }}
          >
            {(["Rename", "Archive", "Delete", "Summarize"] as const).map((action) => (
              <button
                key={action}
                onClick={() => {
                  if (action === "Rename") startRename(session);
                  else if (action === "Archive") archiveSession(session.session_id);
                  else if (action === "Delete") deleteSession(session.session_id);
                  else if (action === "Summarize") summarizeSession(session);
                }}
                style={{ display: "block", width: "100%", background: "none", border: "none", color: action === "Delete" ? "#f87171" : "var(--text-secondary)", fontSize: 13, textAlign: "left", padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--item-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {action}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
