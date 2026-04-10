import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { GridLayout } from "./components/GridLayout";
import { MainPane } from "./components/MainPane";
import { NewSessionModal } from "./components/NewSessionModal";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import {
	addToGroup,
	dropToGroupSlot,
	dropToSlot,
	removeFromGroup,
	removeFromSlot,
	swapSlots,
} from "./groupOps";
import type { ActivityState } from "./hooks/usePtyActivity";
import { usePtyActivity } from "./hooks/usePtyActivity";
import { useSessions } from "./hooks/useSessions";
import { isSessionIgnored, parseIgnorePatterns } from "./sidebarUtils";
import { ThemeProvider } from "./ThemeContext";
import type { ClaudeSession, PaneGroup, PaneLayout } from "./types";
import { useDragDrop } from "./useDragDrop";

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 480;

const SLOT_COUNTS: Record<PaneLayout, number> = {
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

function genId() {
	return Math.random().toString(36).slice(2, 10);
}

function loadGroups(): PaneGroup[] {
	try {
		const saved = localStorage.getItem("pane-groups");
		if (saved) return JSON.parse(saved);
		// Migrate from old grid-sessions format
		const old: string[] = JSON.parse(
			localStorage.getItem("grid-sessions") ?? "[]",
		);
		if (old.length > 0) {
			const layout: PaneLayout =
				old.length <= 1 ? "1x1" : old.length <= 2 ? "2x1" : "2x2";
			const count = SLOT_COUNTS[layout];
			const slots = Array.from({ length: count }, (_, i) => old[i] ?? null);
			return [{ id: genId(), name: "Group 1", layout, slots }];
		}
	} catch {}
	return [];
}

function AppInner() {
	const { sessions, loading, refresh } = useSessions();
	const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
	const clearUnread = useCallback((id: string) => {
		setUnreadSessions((s) => {
			if (!s.has(id)) return s;
			const next = new Set(s);
			next.delete(id);
			return next;
		});
	}, []);
	const handlePtyExit = useCallback((sessionId: string) => {
		setGroups((prev) => {
			const next = prev.map((g) => ({
				...g,
				slots: g.slots.map((s) => (s === sessionId ? null : s)),
			}));
			localStorage.setItem("pane-groups", JSON.stringify(next));
			return next;
		});
		setStandaloneSelectedId((prev) => (prev === sessionId ? null : prev));
	}, []);
	const activityMap = usePtyActivity(
		sessions.map((s) => s.session_id),
		clearUnread,
		handlePtyExit,
	);

	const [ignorePatternsRaw, setIgnorePatternsRaw] = useState(
		() => localStorage.getItem("ignore-patterns") ?? "",
	);
	const ignorePatterns = useMemo(
		() => parseIgnorePatterns(ignorePatternsRaw),
		[ignorePatternsRaw],
	);

	// Override session status based on local PTY state and filter ignored sessions.
	const liveSessions = useMemo(
		() =>
			sessions
				.map((s) =>
					activityMap.has(s.session_id) && s.status === "offline"
						? { ...s, status: "active" as const }
						: s,
				)
				.filter((s) => !isSessionIgnored(s, ignorePatterns)),
		[sessions, activityMap, ignorePatterns],
	);

	const [groups, setGroups] = useState<PaneGroup[]>(loadGroups);
	const [activeGroupId, setActiveGroupId] = useState<string | null>(
		() => localStorage.getItem("active-group-id") ?? null,
	);
	const [focusedSlotIdx, setFocusedSlotIdx] = useState(0);
	const [hoveredSlotIdx, setHoveredSlotIdx] = useState<number | null>(null);
	const [standaloneSelectedId, setStandaloneSelectedId] = useState<
		string | null
	>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [newSessionOpen, setNewSessionOpen] = useState(false);
	const [sidebarVisible, setSidebarVisible] = useState(
		() => localStorage.getItem("sidebar-visible") !== "false",
	);
	const VALID_LAYOUTS: Set<string> = new Set([
		"1x1",
		"2x1",
		"1x2",
		"2x2",
		"3x1",
		"1x3",
		"3x2",
		"2x3",
		"2+1",
		"1+2",
		"3+1",
		"1+3",
	]);
	const [enabledLayouts, setEnabledLayouts] = useState<PaneLayout[]>(() => {
		try {
			const saved = localStorage.getItem("enabled-layouts");
			if (saved) {
				const parsed = (JSON.parse(saved) as string[]).filter((l) =>
					VALID_LAYOUTS.has(l),
				) as PaneLayout[];
				if (parsed.length > 0) return parsed;
			}
		} catch {}
		return ["1x1", "2x1", "1x2", "2x2"];
	});
	const [sidebarWidth, setSidebarWidth] = useState(() =>
		parseInt(localStorage.getItem("sidebar-width") ?? "240", 10),
	);

	const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

	// Re-read ignore patterns when settings closes
	const prevSettingsOpen = useRef(false);
	useEffect(() => {
		if (prevSettingsOpen.current && !settingsOpen) {
			setIgnorePatternsRaw(localStorage.getItem("ignore-patterns") ?? "");
		}
		prevSettingsOpen.current = settingsOpen;
	}, [settingsOpen]);

	// Clear activeGroupId if the group was deleted
	useEffect(() => {
		if (activeGroupId && !groups.find((g) => g.id === activeGroupId)) {
			setActiveGroupId(null);
			localStorage.removeItem("active-group-id");
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
		const needsUpdate = groups.some((g) =>
			g.slots.some((s) => s !== null && !ids.has(s)),
		);
		if (needsUpdate) {
			const next = groups.map((g) => ({
				...g,
				slots: g.slots.map((s) => (s && ids.has(s) ? s : null)),
			}));
			persistGroups(next);
		}
	}, [sessions, groups.some, persistGroups, groups.map]);

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

	const handleActivateGroupAtSlot = useCallback(
		(groupId: string, slotIdx: number) => {
			setActiveGroupId(groupId);
			localStorage.setItem("active-group-id", groupId);
			setStandaloneSelectedId(null);
			setFocusedSlotIdx(slotIdx);
		},
		[],
	);

	const handleCreateGroup = useCallback(() => {
		const id = genId();
		const group: PaneGroup = {
			id,
			name: `Group ${groups.length + 1}`,
			layout: "2x1",
			slots: [null, null],
		};
		persistGroups([...groups, group]);
		activateGroup(id);
	}, [groups, persistGroups, activateGroup]);

	const handleDeleteGroup = useCallback(
		(id: string) => {
			const next = groups.filter((g) => g.id !== id);
			persistGroups(next);
			if (activeGroupId === id) {
				const newActive = next[0]?.id ?? null;
				setActiveGroupId(newActive);
				if (newActive) localStorage.setItem("active-group-id", newActive);
				else localStorage.removeItem("active-group-id");
			}
		},
		[groups, activeGroupId, persistGroups],
	);

	const handleRenameGroup = useCallback(
		(id: string, name: string) => {
			persistGroups(groups.map((g) => (g.id === id ? { ...g, name } : g)));
		},
		[groups, persistGroups],
	);

	const handleChangeLayout = useCallback(
		(id: string, layout: PaneLayout) => {
			const count = SLOT_COUNTS[layout];
			persistGroups(
				groups.map((g) => {
					if (g.id !== id) return g;
					const slots = Array.from(
						{ length: count },
						(_, i) => g.slots[i] ?? null,
					);
					return { ...g, layout, slots };
				}),
			);
			activateGroup(id);
		},
		[groups, activateGroup, persistGroups],
	);

	const handleDropToSlot = useCallback(
		(slotIdx: number, sessionId: string) => {
			if (!activeGroup) return;
			persistGroups(dropToSlot(groups, activeGroup.id, slotIdx, sessionId));
		},
		[groups, activeGroup, persistGroups],
	);

	const handleDropToGroupSlot = useCallback(
		(groupId: string, slotIdx: number, sessionId: string) => {
			persistGroups(dropToGroupSlot(groups, groupId, slotIdx, sessionId));
		},
		[groups, persistGroups],
	);

	const handleSwapSlots = useCallback(
		(fromIdx: number, toIdx: number) => {
			if (!activeGroup) return;
			persistGroups(swapSlots(groups, activeGroup.id, fromIdx, toIdx));
		},
		[groups, activeGroup, persistGroups],
	);

	const handleRemoveFromSlot = useCallback(
		(slotIdx: number) => {
			if (!activeGroup) return;
			persistGroups(removeFromSlot(groups, activeGroup.id, slotIdx));
		},
		[groups, activeGroup, persistGroups],
	);

	const handleRemoveFromGroup = useCallback(
		(sessionId: string) => {
			persistGroups(removeFromGroup(groups, sessionId));
		},
		[groups, persistGroups],
	);

	const handleAddToGroup = useCallback(
		(groupId: string, sessionId: string) => {
			persistGroups(addToGroup(groups, groupId, sessionId, enabledLayouts));
		},
		[groups, enabledLayouts, persistGroups],
	);

	const handleCreateGroupWithSessionRef = useRef<(sid: string) => void>(
		() => {},
	);
	const handleCreateGroupFromSessionsRef = useRef<
		(a: string, b: string) => void
	>(() => {});

	const { isDragging: dndActive } = useDragDrop({
		onDropToGroupSlot: handleDropToGroupSlot,
		onAddToGroup: handleAddToGroup,
		onRemoveFromGroup: handleRemoveFromGroup,
		onCreateGroupFromSessions: (a, b) =>
			handleCreateGroupFromSessionsRef.current(a, b),
		onCreateGroupWithSession: (sid) =>
			handleCreateGroupWithSessionRef.current(sid),
		onDropToGridSlot: handleDropToSlot,
		onSwapGridSlots: handleSwapSlots,
		onActivateGroupAtSlot: handleActivateGroupAtSlot,
	});
	const handleCreateGroupFromSessions = useCallback(
		(sessionIdA: string, sessionIdB: string) => {
			const id = genId();
			const group: PaneGroup = {
				id,
				name: `Group ${groups.length + 1}`,
				layout: "2x1",
				slots: [sessionIdA, sessionIdB],
			};
			persistGroups([...groups, group]);
			activateGroup(id);
		},
		[groups, persistGroups, activateGroup],
	);
	handleCreateGroupFromSessionsRef.current = handleCreateGroupFromSessions;

	const handleCreateGroupWithSession = useCallback(
		(sessionId: string) => {
			const id = genId();
			const next = removeFromGroup(groups, sessionId);
			const group: PaneGroup = {
				id,
				name: `Group ${next.length + 1}`,
				layout: "2x1",
				slots: [sessionId, null],
			};
			persistGroups([...next, group]);
			activateGroup(id);
		},
		[groups, persistGroups, activateGroup],
	);
	handleCreateGroupWithSessionRef.current = handleCreateGroupWithSession;

	const selectSession = useCallback(
		(s: ClaudeSession) => {
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
		},
		[groups, handleActivateGroupAtSlot],
	);

	const selectedId =
		standaloneSelectedId ?? activeGroup?.slots[focusedSlotIdx] ?? null;

	// Mark unread when computing→waiting on a non-focused session
	const prevActivityForUnreadRef = useRef<Map<string, ActivityState>>(
		new Map(),
	);
	useEffect(() => {
		const prev = prevActivityForUnreadRef.current;
		for (const [id, state] of activityMap) {
			if (
				state === "waiting" &&
				prev.get(id) === "computing" &&
				id !== selectedId
			) {
				setUnreadSessions((s) => new Set(s).add(id));
				if (localStorage.getItem("notif-sound-enabled") === "true") {
					const soundPath = localStorage.getItem("notif-sound-path");
					if (soundPath)
						invoke("play_sound", { path: soundPath }).catch(() => {});
				}
			}
		}
		prevActivityForUnreadRef.current = new Map(activityMap);
	}, [activityMap, selectedId]);

	// Clear unread when a session is focused (click pane or sidebar)
	useEffect(() => {
		if (selectedId) clearUnread(selectedId);
	}, [selectedId, clearUnread]);

	const handleNewSession = useCallback(
		(cwd: string) => {
			const tmpId = `new-${Date.now()}`;
			const skipPermissions =
				localStorage.getItem("skip-permissions") === "true";
			invoke("pty_spawn", {
				id: tmpId,
				cwd,
				rows: 24,
				cols: 80,
				resume: false,
				cmd: null,
				skipPermissions,
			})
				.then(() => refresh())
				.catch(console.error);
		},
		[refresh],
	);

	// Flush pending renames when a session transitions to "waiting"
	const prevActivityRef = useRef<Map<string, ActivityState>>(new Map());
	useEffect(() => {
		const prev = prevActivityRef.current;
		for (const session of sessions) {
			const prevState = prev.get(session.session_id);
			const currState = activityMap.get(session.session_id);
			if (
				currState === "waiting" &&
				prevState !== "waiting" &&
				session.pending_rename
			) {
				const encoded = Array.from(
					new TextEncoder().encode(`/rename ${session.pending_rename}\r`),
				);
				invoke("pty_write", { id: session.session_id, data: encoded })
					.then(() =>
						invoke("clear_pending_rename", { sessionId: session.session_id }),
					)
					.then(() => refresh())
					.catch(console.error);
			}
		}
		prevActivityRef.current = new Map(activityMap);
	}, [activityMap, sessions, refresh]);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key === "k") {
				e.preventDefault();
				setPaletteOpen((o) => !o);
				return;
			}
			if (mod && e.key === "p") {
				e.preventDefault();
				setSettingsOpen((o) => !o);
				return;
			}
			if (mod && e.key === "b") {
				e.preventDefault();
				setSidebarVisible((v) => {
					localStorage.setItem("sidebar-visible", String(!v));
					return !v;
				});
				return;
			}
			if (mod && e.shiftKey && e.key === "N") {
				e.preventDefault();
				setNewSessionOpen(true);
				return;
			}
			if (mod && e.key === "m") {
				e.preventDefault();
				import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
					getCurrentWindow().minimize(),
				);
				return;
			}
			if (mod && e.key === "n") {
				e.preventDefault();
				invoke("new_window").catch(console.error);
				return;
			}
			if (mod && e.key === "w") {
				e.preventDefault();
				if (selectedId) {
					invoke("archive_session", { sessionId: selectedId })
						.then(() => refresh())
						.catch(console.error);
				}
				return;
			}

			if (mod && (e.key === "Backspace" || e.key === "Delete")) {
				e.preventDefault();
				if (activeGroupId) {
					handleDeleteGroup(activeGroupId);
				} else if (selectedId) {
					invoke("archive_session", { sessionId: selectedId })
						.then(() => refresh())
						.catch(console.error);
				}
				return;
			}

			if (e.ctrlKey && e.key === "Tab" && groups.length > 0) {
				e.preventDefault();
				const currentIdx = groups.findIndex((g) => g.id === activeGroupId);
				const delta = e.shiftKey ? -1 : 1;
				const nextIdx = (currentIdx + delta + groups.length) % groups.length;
				activateGroup(groups[nextIdx].id);
				return;
			}

			if (paletteOpen || settingsOpen) return;
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;

			if (e.key >= "1" && e.key <= "9" && mod) {
				e.preventDefault();
				const target = groups[parseInt(e.key, 10) - 1];
				if (target) activateGroup(target.id);
				return;
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [
		selectedId,
		paletteOpen,
		settingsOpen,
		groups.length,
		groups.findIndex,
		groups,
		refresh,
		handleDeleteGroup,
		activeGroupId,
		activateGroup,
	]);

	function startResize(e: React.MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = sidebarWidth;
		function onMove(e: MouseEvent) {
			const w = Math.max(
				MIN_SIDEBAR_WIDTH,
				Math.min(MAX_SIDEBAR_WIDTH, startWidth + e.clientX - startX),
			);
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
			<div
				data-tauri-drag-region
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100%",
					color: "var(--text-very-muted)",
					fontSize: 12,
				}}
			>
				<span style={{ pointerEvents: "none" }}>Loading sessions...</span>
			</div>
		);
	}

	return (
		<div
			style={{
				display: "flex",
				height: "100%",
				background: "var(--bg-main)",
				position: "relative",
			}}
		>
			{/* Window drag bar — always present at top for titlebar overlay */}
			<div
				data-tauri-drag-region
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: 28,
					zIndex: 900,
				}}
			/>
			{sidebarVisible && (
				<Sidebar
					sessions={liveSessions}
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
					enabledLayouts={enabledLayouts}
					unreadSessions={unreadSessions}
					onHoverSlot={setHoveredSlotIdx}
				/>
			)}
			{sidebarVisible && (
				<div
					role="separator"
					tabIndex={0}
					aria-orientation="vertical"
					aria-valuenow={sidebarWidth}
					aria-valuemin={MIN_SIDEBAR_WIDTH}
					aria-valuemax={MAX_SIDEBAR_WIDTH}
					aria-label="Resize sidebar"
					onMouseDown={startResize}
					style={{
						width: 4,
						cursor: "col-resize",
						flexShrink: 0,
						background: "var(--bg-sidebar)",
						transition: "background 0.1s",
					}}
					onMouseEnter={(e) =>
						(e.currentTarget.style.background = "var(--border)")
					}
					onMouseLeave={(e) =>
						(e.currentTarget.style.background = "var(--bg-sidebar)")
					}
				/>
			)}
			{standaloneSelectedId ? (
				<MainPane
					session={
						liveSessions.find((s) => s.session_id === standaloneSelectedId) ??
						null
					}
					activityMap={activityMap}
					unreadSessions={unreadSessions}
					focused
				/>
			) : (
				<GridLayout
					group={activeGroup}
					sessions={liveSessions}
					focusedIdx={focusedSlotIdx}
					hoveredIdx={hoveredSlotIdx}
					onFocus={setFocusedSlotIdx}
					onRemoveFromSlot={handleRemoveFromSlot}
					dndActive={dndActive}
					activityMap={activityMap}
					unreadSessions={unreadSessions}
				/>
			)}

			{paletteOpen && (
				<CommandPalette
					sessions={liveSessions}
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
			{settingsOpen && (
				<Settings
					onClose={() => setSettingsOpen(false)}
					enabledLayouts={enabledLayouts}
					onChangeEnabledLayouts={(layouts) => {
						setEnabledLayouts(layouts);
						localStorage.setItem("enabled-layouts", JSON.stringify(layouts));
					}}
				/>
			)}
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
