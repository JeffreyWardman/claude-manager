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
	SLOT_COUNTS,
	swapSlots,
} from "./groupOps";
import { useProfiles } from "./hooks/useProfiles";
import type { ActivityState } from "./hooks/usePtyActivity";
import { usePtyActivity } from "./hooks/usePtyActivity";
import { useSessions } from "./hooks/useSessions";
import { isSessionIgnored, parseIgnorePatterns } from "./sidebarUtils";
import { ThemeProvider } from "./ThemeContext";
import type { ClaudeSession, PaneGroup, PaneLayout } from "./types";
import { useDragDrop } from "./useDragDrop";
import { pathBasename } from "./utils";

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 480;

function genId() {
	return crypto.randomUUID().slice(0, 8);
}

function groupsKey(profilePath: string): string {
	return profilePath ? `pane-groups:${profilePath}` : "pane-groups";
}

function activeGroupKey(profilePath: string): string {
	return profilePath ? `active-group-id:${profilePath}` : "active-group-id";
}

function loadGroups(profilePath: string): PaneGroup[] {
	try {
		const saved = localStorage.getItem(groupsKey(profilePath));
		if (saved) {
			return JSON.parse(saved);
		}
		// Migrate from old unscoped key on first load
		if (profilePath) {
			const old = localStorage.getItem("pane-groups");
			if (old) {
				return JSON.parse(old);
			}
		}
	} catch {}
	return [];
}

function AppInner() {
	const { profiles, visibleProfiles, refresh: refreshProfiles, saveProfiles } = useProfiles();

	const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
		const params = new URLSearchParams(window.location.search);
		return params.get("profile");
	});

	const activeProfile =
		visibleProfiles.find((p) => p.id === activeProfileId) ?? visibleProfiles[0] ?? null;
	const configDir = activeProfile?.path ?? "";

	const { sessions, loading, refresh } = useSessions(configDir);
	const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
	const clearUnread = useCallback((id: string) => {
		setUnreadSessions((s) => {
			if (!s.has(id)) {
				return s;
			}
			const next = new Set(s);
			next.delete(id);
			return next;
		});
	}, []);
	const configDirRef = useRef(configDir);
	configDirRef.current = configDir;
	const sessionsRef = useRef(sessions);
	sessionsRef.current = sessions;
	// Tracks a newly spawned session. The PTY runs under tmpId.
	// liveSessions matches the real Claude session by existingIds + cwd to pull its name.
	const [pendingSpawn, setPendingSpawn] = useState<{
		tmpId: string;
		cwd: string;
		existingIds: Set<string>;
	} | null>(null);

	const handlePtyExit = useCallback((sessionId: string) => {
		setGroups((prev) => {
			const next = prev.map((g) => ({
				...g,
				slots: g.slots.map((s) => (s === sessionId ? null : s)),
			}));
			localStorage.setItem(groupsKey(configDirRef.current), JSON.stringify(next));
			return next;
		});
		setStandaloneSelectedId((prev) => (prev === sessionId ? null : prev));
		setPendingSpawn((prev) => (prev?.tmpId === sessionId ? null : prev));
	}, []);
	// Include pending tmpId so activity tracking works for the synthetic session
	const trackedIds = useMemo(() => {
		const ids = sessions.map((s) => s.session_id);
		if (pendingSpawn && !ids.includes(pendingSpawn.tmpId)) {
			ids.push(pendingSpawn.tmpId);
		}
		return ids;
	}, [sessions, pendingSpawn]);
	const { activityMap, alivePtys } = usePtyActivity(trackedIds, clearUnread, handlePtyExit);

	const [ignorePatternsRaw, setIgnorePatternsRaw] = useState(
		() => localStorage.getItem("ignore-patterns") ?? "",
	);
	const ignorePatterns = useMemo(() => parseIgnorePatterns(ignorePatternsRaw), [ignorePatternsRaw]);

	// Override session status based on local PTY state and filter ignored sessions.
	// A session is "active" if it has activity OR if its PTY has produced any output.
	const liveSessions = useMemo(() => {
		const discovered = sessions
			.map((s) =>
				(activityMap.has(s.session_id) || alivePtys.has(s.session_id)) && s.status === "offline"
					? { ...s, status: "active" as const }
					: s,
			)
			.filter((s) => !isSessionIgnored(s, ignorePatterns));
		// Inject synthetic entry that stays under tmpId for the PTY's lifetime
		if (pendingSpawn && !discovered.some((s) => s.session_id === pendingSpawn.tmpId)) {
			const folderName = pathBasename(pendingSpawn.cwd) || "new";
			const spawnFolder = pathBasename(pendingSpawn.cwd);
			// Find the real session inline — no effect needed, no intermediate render
			const real = discovered.find(
				(s) => !pendingSpawn.existingIds.has(s.session_id) && pathBasename(s.cwd) === spawnFolder,
			);
			if (real) {
				discovered.splice(discovered.indexOf(real), 1);
			}
			discovered.unshift({
				pid: real?.pid ?? 0,
				session_id: pendingSpawn.tmpId,
				cwd: pendingSpawn.cwd,
				project_name: folderName,
				started_at: real?.started_at ?? Date.now(),
				last_modified: real?.last_modified ?? Date.now(),
				status: "active",
				display_name: real
					? real.display_name || `${real.project_name}-${real.session_id.slice(0, 5)}`
					: `${folderName}-{pending-id}`,
				git_branch: real?.git_branch ?? null,
				pending_rename: null,
			});
		}
		return discovered;
	}, [sessions, activityMap, alivePtys, ignorePatterns, pendingSpawn]);

	const [groups, setGroups] = useState<PaneGroup[]>(() => loadGroups(configDir));
	const [activeGroupId, setActiveGroupId] = useState<string | null>(
		() => localStorage.getItem(activeGroupKey(configDir)) ?? null,
	);

	// Reload groups when profile changes
	useEffect(() => {
		setGroups(loadGroups(configDir));
		setActiveGroupId(localStorage.getItem(activeGroupKey(configDir)) ?? null);
	}, [configDir]);
	const [focusedSlotIdx, setFocusedSlotIdx] = useState(0);
	const [hoveredSlotIdx, setHoveredSlotIdx] = useState<number | null>(null);
	const [standaloneSelectedId, setStandaloneSelectedId] = useState<string | null>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [newSessionOpen, setNewSessionOpen] = useState(false);
	const [sidebarVisible, setSidebarVisible] = useState(
		() => localStorage.getItem("sidebar-visible") !== "false",
	);
	const [enabledLayouts, setEnabledLayouts] = useState<PaneLayout[]>(() => {
		try {
			const saved = localStorage.getItem("enabled-layouts");
			if (saved) {
				const parsed = (JSON.parse(saved) as string[]).filter(
					(l) => l in SLOT_COUNTS,
				) as PaneLayout[];
				if (parsed.length > 0) {
					return parsed;
				}
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
			localStorage.removeItem(activeGroupKey(configDir));
		}
	}, [groups, activeGroupId, configDir]);

	const persistGroups = useCallback((next: PaneGroup[]) => {
		setGroups(next);
		localStorage.setItem(groupsKey(configDirRef.current), JSON.stringify(next));
	}, []);

	const activateGroup = useCallback((id: string) => {
		setActiveGroupId(id);
		localStorage.setItem(activeGroupKey(configDirRef.current), id);
		setFocusedSlotIdx(0);
		setStandaloneSelectedId(null);
	}, []);

	// Keep focusedSlotIdx in bounds
	useEffect(() => {
		const max = (activeGroup?.slots.length ?? 1) - 1;
		if (focusedSlotIdx > max) {
			setFocusedSlotIdx(0);
		}
	}, [activeGroup?.slots.length, focusedSlotIdx]);

	// Remove archived/deleted sessions from all group slots
	useEffect(() => {
		if (liveSessions.length === 0) {
			return;
		}
		const ids = new Set(liveSessions.map((s) => s.session_id));
		const needsUpdate = groups.some((g) => g.slots.some((s) => s !== null && !ids.has(s)));
		if (needsUpdate) {
			const next = groups.map((g) => ({
				...g,
				slots: g.slots.map((s) => (s && ids.has(s) ? s : null)),
			}));
			persistGroups(next);
		}
	}, [liveSessions, groups, persistGroups]);

	const handleActivateGroupAtSlot = useCallback((groupId: string, slotIdx: number) => {
		setActiveGroupId(groupId);
		localStorage.setItem(activeGroupKey(configDirRef.current), groupId);
		setStandaloneSelectedId(null);
		setFocusedSlotIdx(slotIdx);
	}, []);

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
				if (newActive) {
					localStorage.setItem(activeGroupKey(configDirRef.current), newActive);
				} else {
					localStorage.removeItem(activeGroupKey(configDirRef.current));
				}
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
					if (g.id !== id) {
						return g;
					}
					const slots = Array.from({ length: count }, (_, i) => g.slots[i] ?? null);
					return { ...g, layout, slots };
				}),
			);
			activateGroup(id);
		},
		[groups, activateGroup, persistGroups],
	);

	const handleDropToSlot = useCallback(
		(slotIdx: number, sessionId: string) => {
			if (!activeGroup) {
				return;
			}
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
			if (!activeGroup) {
				return;
			}
			persistGroups(swapSlots(groups, activeGroup.id, fromIdx, toIdx));
		},
		[groups, activeGroup, persistGroups],
	);

	const handleRemoveFromSlot = useCallback(
		(slotIdx: number) => {
			if (!activeGroup) {
				return;
			}
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
			localStorage.removeItem(activeGroupKey(configDirRef.current));
			setFocusedSlotIdx(0);
			setStandaloneSelectedId(s.session_id);
		},
		[groups, handleActivateGroupAtSlot],
	);

	const selectedId = standaloneSelectedId ?? activeGroup?.slots[focusedSlotIdx] ?? null;

	// Mark unread when computing→waiting on a non-focused session
	const prevActivityForUnreadRef = useRef<Map<string, ActivityState>>(new Map());
	useEffect(() => {
		const prev = prevActivityForUnreadRef.current;
		for (const [id, state] of activityMap) {
			if (
				state === "waiting" &&
				prev.get(id) === "computing" &&
				(id !== selectedId || !windowFocusedRef.current)
			) {
				setUnreadSessions((s) => new Set(s).add(id));
				if (localStorage.getItem("notif-sound-enabled") === "true") {
					const soundPath = localStorage.getItem("notif-sound-path");
					if (soundPath) {
						invoke("play_sound", { path: soundPath }).catch(() => {});
					}
				}
			}
		}
		prevActivityForUnreadRef.current = new Map(activityMap);
	}, [activityMap, selectedId]);

	// Clear unread when a session is focused (click pane or sidebar)
	useEffect(() => {
		if (selectedId) {
			clearUnread(selectedId);
		}
	}, [selectedId, clearUnread]);

	// Dock badge: show unread count when window loses focus (Cmd+Tab, Cmd+H)
	const windowFocusedRef = useRef(true);
	const unreadCountRef = useRef(0);
	unreadCountRef.current = unreadSessions.size;
	const selectedIdRef = useRef(selectedId);
	selectedIdRef.current = selectedId;

	useEffect(() => {
		const count = unreadSessions.size;
		if (!windowFocusedRef.current && count > 0) {
			invoke("set_badge_count", { count }).catch(() => {});
		}
	}, [unreadSessions]);

	useEffect(() => {
		let unlisten: (() => void) | null = null;
		import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
			const win = getCurrentWindow();
			win
				.onFocusChanged(({ payload: focused }) => {
					windowFocusedRef.current = focused;
					if (focused) {
						invoke("set_badge_count", { count: null }).catch(() => {});
						if (selectedIdRef.current) {
							clearUnread(selectedIdRef.current);
						}
					} else if (unreadCountRef.current > 0) {
						invoke("set_badge_count", { count: unreadCountRef.current }).catch(() => {});
					}
				})
				.then((fn) => {
					unlisten = fn;
				});
		});
		return () => unlisten?.();
	}, []);

	const handleNewSession = useCallback(
		(cwd: string) => {
			const tmpId = `new-${Date.now()}`;
			const skipPermissions = localStorage.getItem("skip-permissions") === "true";
			const existingIds = new Set(sessionsRef.current.map((s) => s.session_id));
			setPendingSpawn({ tmpId, cwd, existingIds });
			setStandaloneSelectedId(tmpId);

			invoke("pty_spawn", {
				id: tmpId,
				cwd,
				rows: 24,
				cols: 80,
				resume: false,
				cmd: null,
				skipPermissions,
				configDir,
			})
				.then(() => refresh())
				.catch(console.error);
		},
		[refresh, configDir],
	);

	// Poll aggressively until the real session is discovered.
	// Once found, replace tmpId references in groups and standalone selection.
	const tmpIdSwapped = useRef<string | null>(null);
	useEffect(() => {
		if (!pendingSpawn) {
			return;
		}
		if (tmpIdSwapped.current === pendingSpawn.tmpId) {
			return;
		}
		const spawnFolder = pathBasename(pendingSpawn.cwd);
		const real = sessions.find(
			(s) => !pendingSpawn.existingIds.has(s.session_id) && pathBasename(s.cwd) === spawnFolder,
		);
		if (real) {
			tmpIdSwapped.current = pendingSpawn.tmpId;
			setGroups((prev) => {
				const hasTmpId = prev.some((g) => g.slots.includes(pendingSpawn.tmpId));
				if (!hasTmpId) {
					return prev;
				}
				const next = prev.map((g) => ({
					...g,
					slots: g.slots.map((s) => (s === pendingSpawn.tmpId ? real.session_id : s)),
				}));
				localStorage.setItem(groupsKey(configDirRef.current), JSON.stringify(next));
				return next;
			});
			if (standaloneSelectedId === pendingSpawn.tmpId) {
				setStandaloneSelectedId(real.session_id);
			}
			return;
		}
		const poll = setInterval(refresh, 200);
		return () => clearInterval(poll);
	}, [sessions, pendingSpawn, refresh, standaloneSelectedId]);

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
				session.pending_rename &&
				alivePtys.has(session.session_id)
			) {
				const safeName = session.pending_rename
					.split("")
					.filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
					.join("");
				const encoded = Array.from(new TextEncoder().encode(`/rename ${safeName}\r`));
				invoke("pty_write", { id: session.session_id, data: encoded })
					.then(() => invoke("clear_pending_rename", { sessionId: session.session_id }))
					.then(() => refresh())
					.catch(console.error);
			}
		}
		prevActivityRef.current = new Map(activityMap);
	}, [activityMap, sessions, refresh, alivePtys]);

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
				invoke("new_window", { profile: activeProfile?.id ?? null }).catch(console.error);
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

			if (paletteOpen || settingsOpen) {
				return;
			}
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") {
				return;
			}

			if (e.key >= "1" && e.key <= "9" && mod) {
				e.preventDefault();
				const target = groups[parseInt(e.key, 10) - 1];
				if (target) {
					activateGroup(target.id);
				}
				return;
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [
		selectedId,
		paletteOpen,
		settingsOpen,
		groups,
		refresh,
		handleDeleteGroup,
		activeGroupId,
		activateGroup,
		activeProfile?.id,
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
					onAddToGroup={handleAddToGroup}
					onOpenPalette={() => setPaletteOpen(true)}
					onOpenSettings={() => setSettingsOpen(true)}
					onOpenNewSession={() => setNewSessionOpen(true)}
					onRefresh={refresh}
					enabledLayouts={enabledLayouts}
					unreadSessions={unreadSessions}
					onHoverSlot={setHoveredSlotIdx}
					profiles={visibleProfiles}
					activeProfile={activeProfile}
					onSwitchProfile={(id: string) => setActiveProfileId(id)}
					configDir={configDir}
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
					onKeyDown={(e) => {
						if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
							e.preventDefault();
							const delta = e.key === "ArrowRight" ? 8 : -8;
							const w = Math.max(
								MIN_SIDEBAR_WIDTH,
								Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth + delta),
							);
							setSidebarWidth(w);
							localStorage.setItem("sidebar-width", String(w));
						}
					}}
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
				<div
					className={
						activityMap.get(standaloneSelectedId) === "computing" ? "pane-computing" : undefined
					}
					style={{ flex: 1, position: "relative", overflow: "hidden" }}
				>
					<MainPane
						session={liveSessions.find((s) => s.session_id === standaloneSelectedId) ?? null}
						activityMap={activityMap}
						unreadSessions={unreadSessions}
						focused
						configDir={configDir}
					/>
				</div>
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
					configDir={configDir}
				/>
			)}

			{paletteOpen && (
				<CommandPalette
					sessions={liveSessions}
					groups={groups}
					onSelect={selectSession}
					onClearEmptyGroups={() => {
						const next = groups.filter((g) => g.slots.some((s) => s !== null));
						persistGroups(next);
					}}
					onDeleteAllGroups={() => persistGroups([])}
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
					profiles={profiles}
					onSaveProfiles={saveProfiles}
					onRefreshProfiles={refreshProfiles}
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
