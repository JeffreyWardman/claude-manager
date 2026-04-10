import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { ActivityState } from "../hooks/usePtyActivity";
import type { SortMode } from "../sidebarUtils";
import {
	containsMatch,
	groupByLocation,
	groupByStatus,
	sessionMatchesFolder,
	sessionMatchesSearch,
	sortSessions,
} from "../sidebarUtils";
import type { ClaudeSession, PaneGroup, PaneLayout } from "../types";
import { StatusDot } from "./StatusDot";

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
	enabledLayouts: PaneLayout[];
	unreadSessions: Set<string>;
	onHoverSlot: (idx: number | null) => void;
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
	if (m < 1) {
		return "now";
	}
	if (m < 60) {
		return `${m}m`;
	}
	const h = Math.floor(m / 60);
	if (h < 24) {
		return `${h}h`;
	}
	return `${Math.floor(h / 24)}d`;
}

const LAYOUT_ICON_CELLS: Record<
	PaneLayout,
	{ cols: number; rows: number; cells: [string, string][] }
> = {
	"1x1": { cols: 1, rows: 1, cells: [["1", "1"]] },
	"2x1": {
		cols: 2,
		rows: 1,
		cells: [
			["1", "1"],
			["2", "1"],
		],
	},
	"1x2": {
		cols: 1,
		rows: 2,
		cells: [
			["1", "1"],
			["1", "2"],
		],
	},
	"2x2": {
		cols: 2,
		rows: 2,
		cells: [
			["1", "1"],
			["2", "1"],
			["1", "2"],
			["2", "2"],
		],
	},
	"3x1": {
		cols: 3,
		rows: 1,
		cells: [
			["1", "1"],
			["2", "1"],
			["3", "1"],
		],
	},
	"1x3": {
		cols: 1,
		rows: 3,
		cells: [
			["1", "1"],
			["1", "2"],
			["1", "3"],
		],
	},
	"3x2": {
		cols: 3,
		rows: 2,
		cells: [
			["1", "1"],
			["2", "1"],
			["3", "1"],
			["1", "2"],
			["2", "2"],
			["3", "2"],
		],
	},
	"2x3": {
		cols: 2,
		rows: 3,
		cells: [
			["1", "1"],
			["2", "1"],
			["1", "2"],
			["2", "2"],
			["1", "3"],
			["2", "3"],
		],
	},
	"2+1": {
		cols: 2,
		rows: 2,
		cells: [
			["1", "1"],
			["2", "1"],
			["1 / 3", "2"],
		],
	},
	"1+2": {
		cols: 2,
		rows: 2,
		cells: [
			["1 / 3", "1"],
			["1", "2"],
			["2", "2"],
		],
	},
	"3+1": {
		cols: 3,
		rows: 2,
		cells: [
			["1", "1"],
			["2", "1"],
			["3", "1"],
			["1 / 4", "2"],
		],
	},
	"1+3": {
		cols: 3,
		rows: 2,
		cells: [
			["1 / 4", "1"],
			["1", "2"],
			["2", "2"],
			["3", "2"],
		],
	},
};

function LayoutIcon({ layout }: { layout: PaneLayout }) {
	const entry = LAYOUT_ICON_CELLS[layout];
	if (!entry) {
		return null;
	}
	const { cols, rows, cells } = entry;
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${cols}, 1fr)`,
				gridTemplateRows: `repeat(${rows}, 1fr)`,
				gap: 1,
			}}
		>
			{cells.map(([gc, gr], i) => (
				<div
					key={i}
					style={{
						gridColumn: gc,
						gridRow: gr,
						width: "100%",
						height: 4,
						background: "currentColor",
						borderRadius: 1,
						minWidth: 5,
					}}
				/>
			))}
		</div>
	);
}

export function Sidebar({
	sessions,
	selectedId,
	groups,
	activeGroupId,
	activityMap,
	width,
	onSelect,
	onActivateGroup,
	onActivateGroupAtSlot,
	onCreateGroup,
	onDeleteGroup,
	onRenameGroup,
	onChangeLayout,
	onRemoveFromGroup,
	onOpenPalette,
	onOpenSettings,
	onOpenNewSession,
	onRefresh,
	enabledLayouts,
	unreadSessions,
	onHoverSlot,
}: Props) {
	const [sidebarSearch, setSidebarSearch] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	const [groupsCollapsed, setGroupsCollapsed] = useState(false);
	const [groupMode, setGroupMode] = useState<GroupMode>(
		() => (localStorage.getItem("sidebar-group-mode") as GroupMode | null) ?? "status",
	);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>(
		() => (localStorage.getItem("sidebar-status-filter") as StatusFilter | null) ?? "all",
	);
	const [sortMode, setSortMode] = useState<SortMode>(
		() => (localStorage.getItem("sidebar-sort-mode") as SortMode | null) ?? "date",
	);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
	// Group-level state
	const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
	const [renameGroupValue, setRenameGroupValue] = useState("");
	const [layoutPickerGroupId, setLayoutPickerGroupId] = useState<string | null>(null);
	const [groupSlotContextMenu, setGroupSlotContextMenu] = useState<{
		sessionId: string;
		x: number;
		y: number;
	} | null>(null);
	const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

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
		if (!contextMenu && !layoutPickerGroupId && !groupSlotContextMenu && !filterDropdownOpen)
			return;
		const close = () => {
			setContextMenu(null);
			setLayoutPickerGroupId(null);
			setGroupSlotContextMenu(null);
			setFilterDropdownOpen(false);
		};
		window.addEventListener("click", close);
		return () => window.removeEventListener("click", close);
	}, [contextMenu, layoutPickerGroupId, groupSlotContextMenu, filterDropdownOpen]);

	const filteredSessions = sortSessions(
		statusFilter === "all" ? sessions : sessions.filter((s) => s.status === statusFilter),
		sortMode,
	);

	const rawSearch = sidebarSearch.trim();
	const searchMode = rawSearch.startsWith("@group:")
		? "group"
		: rawSearch.startsWith("@tab:")
			? "session"
			: rawSearch.startsWith("@folder:")
				? "folder"
				: "all";
	const prefixLen =
		searchMode === "group" ? 7 : searchMode === "session" ? 5 : searchMode === "folder" ? 8 : 0;
	const searchQuery = rawSearch.slice(prefixLen).toLowerCase().trim();

	const matchSession = searchMode === "folder" ? sessionMatchesFolder : sessionMatchesSearch;

	const filteredGroups = searchQuery
		? groups.filter((g) => {
				if (searchMode === "session" || searchMode === "folder") {
					return g.slots.some((sid) => {
						if (!sid) {
							return false;
						}
						const s = sessions.find((s) => s.session_id === sid);
						return s && matchSession(s, searchQuery);
					});
				}
				if (containsMatch(g.name, searchQuery)) {
					return true;
				}
				if (searchMode === "group") {
					return false;
				}
				return g.slots.some((sid) => {
					if (!sid) {
						return false;
					}
					const s = sessions.find((s) => s.session_id === sid);
					return s && matchSession(s, searchQuery);
				});
			})
		: groups;

	const searchFilteredSessions = searchQuery
		? searchMode === "group"
			? []
			: filteredSessions.filter((s) => matchSession(s, searchQuery))
		: filteredSessions;

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (renamingId || renamingGroupId) {
				return;
			}
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				if ((e.target as HTMLElement)?.closest?.(".xterm")) {
					return;
				}
				e.preventDefault();
				const flatItems = filteredSessions;
				const idx = flatItems.findIndex((s) => s.session_id === selectedId);
				if (idx === -1) {
					if (flatItems[0]) {
						onSelect(flatItems[0]);
					}
					return;
				}
				const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
				const target = flatItems[Math.max(0, Math.min(flatItems.length - 1, next))];
				if (target) {
					onSelect(target);
					itemRefs.current
						.get(target.session_id)
						?.scrollIntoView({ block: "nearest" } as ScrollIntoViewOptions);
				}
			}
			if (e.key === "Enter" && selectedId) {
				if ((e.target as HTMLElement)?.closest?.(".xterm")) {
					return;
				}
				const session = sessions.find((s) => s.session_id === selectedId);
				if (session) {
					startRename(session);
				}
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [sessions, selectedId, onSelect, renamingId, renamingGroupId, filteredSessions, startRename]);

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
				await invoke("pty_write", {
					id: sessionId,
					data: Array.from(new TextEncoder().encode(`/rename ${trimmed}\r`)),
				});
				await invoke("clear_pending_rename", { sessionId });
			}
			onRefresh();
		} catch (e) {
			console.error(e);
		}
		setRenamingId(null);
	}

	function startRenameGroup(group: PaneGroup) {
		setRenamingGroupId(group.id);
		setRenameGroupValue(group.name);
	}

	function commitRenameGroup(id: string) {
		const trimmed = renameGroupValue.trim();
		if (trimmed) {
			onRenameGroup(id, trimmed);
		}
		setRenamingGroupId(null);
	}

	async function archiveSession(sessionId: string) {
		setContextMenu(null);
		try {
			await invoke("archive_session", { sessionId });
			onRefresh();
		} catch (e) {
			console.error(e);
		}
	}

	async function deleteSession(sessionId: string) {
		setContextMenu(null);
		const { ask } = await import("@tauri-apps/plugin-dialog");
		const confirmed = await ask(
			"This will permanently delete the conversation file. This cannot be undone.",
			{ title: "Delete session?", kind: "warning" },
		);
		if (!confirmed) {
			return;
		}
		try {
			await invoke("delete_session", { sessionId });
			onRefresh();
		} catch (e) {
			console.error(e);
		}
	}

	// Sessions assigned to any group are shown in the groups section — hide from sessions list
	const sessionsInGroups = new Set(
		groupsCollapsed ? [] : filteredGroups.flatMap((g) => g.slots.filter(Boolean) as string[]),
	);
	const unassignedSessions = searchFilteredSessions.filter(
		(s) => !sessionsInGroups.has(s.session_id),
	);
	const sessionGroups =
		groupMode === "status"
			? groupByStatus(unassignedSessions, sortMode)
			: groupByLocation(unassignedSessions, sortMode);

	const iconBtn = {
		background: "none",
		border: "none",
		color: "var(--text-very-muted)",
		cursor: "pointer",
		fontSize: 13,
		lineHeight: 1,
		padding: "2px 4px",
		borderRadius: 4,
	} as React.CSSProperties;

	const sectionLabel = {
		fontSize: 10,
		fontWeight: 600,
		letterSpacing: "0.06em",
		color: "var(--text-muted)",
	} as React.CSSProperties;

	return (
		<div
			className="flex flex-col h-full overflow-hidden"
			style={{ background: "var(--bg-sidebar)", width, flexShrink: 0 }}
		>
			{/* Header */}
			<div
				data-tauri-drag-region
				className="flex items-center justify-between px-4"
				style={{ height: 52, paddingTop: 28, flexShrink: 0 }}
			>
				<span
					style={{
						fontSize: 13,
						fontWeight: 600,
						color: "var(--text-primary)",
						letterSpacing: "-0.01em",
					}}
				>
					Claude Manager
				</span>
				<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<button
						type="button"
						onClick={() => {
							const next: StatusFilter =
								statusFilter === "all" ? "active" : statusFilter === "active" ? "offline" : "all";
							setStatusFilter(next);
							localStorage.setItem("sidebar-status-filter", next);
						}}
						aria-label={`Filter: ${statusFilter}. Click to cycle.`}
						title={`Filter: ${statusFilter}`}
						style={{
							...iconBtn,
							fontSize: 10,
							fontWeight: 600,
							letterSpacing: "0.04em",
							color: "var(--text-secondary)",
						}}
						onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
						onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
					>
						{statusFilter === "all" ? "ALL" : statusFilter === "active" ? "ACTIVE" : "OFF"}
					</button>
					<div style={{ position: "relative" }}>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setFilterDropdownOpen((o) => !o);
							}}
							aria-label="Sort and group options"
							aria-expanded={filterDropdownOpen}
							title="Sort & group"
							style={{
								...iconBtn,
								fontSize: 12,
								color:
									sortMode !== "date" || groupMode !== "status"
										? "var(--text-secondary)"
										: "var(--text-very-muted)",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
							onMouseLeave={(e) =>
								(e.currentTarget.style.color =
									sortMode !== "date" || groupMode !== "status"
										? "var(--text-secondary)"
										: "var(--text-very-muted)")
							}
						>
							↕
						</button>
						{filterDropdownOpen && (
							<div
								onClick={(e) => e.stopPropagation()}
								style={{
									position: "absolute",
									top: "100%",
									right: 0,
									marginTop: 4,
									background: "var(--bg-sidebar)",
									border: "1px solid var(--border)",
									borderRadius: 6,
									boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
									zIndex: 1000,
									minWidth: 160,
									padding: "6px 0",
								}}
							>
								<div style={{ padding: "4px 12px 2px", ...sectionLabel }}>SORT</div>
								{(
									[
										["date", "Newest first"],
										["alpha", "Alphabetical"],
									] as [SortMode, string][]
								).map(([val, label]) => (
									<button
										type="button"
										key={val}
										onClick={() => {
											setSortMode(val);
											localStorage.setItem("sidebar-sort-mode", val);
										}}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											width: "100%",
											background: "none",
											border: "none",
											color: "var(--text-secondary)",
											fontSize: 12,
											textAlign: "left",
											padding: "5px 12px",
											cursor: "pointer",
											fontFamily: "inherit",
										}}
										onMouseEnter={(e) => (e.currentTarget.style.background = "var(--item-hover)")}
										onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
									>
										<span
											style={{
												width: 6,
												height: 6,
												borderRadius: "50%",
												background: sortMode === val ? "var(--accent)" : "transparent",
												border: `1.5px solid ${sortMode === val ? "var(--accent)" : "var(--text-very-muted)"}`,
												flexShrink: 0,
											}}
										/>
										{label}
									</button>
								))}

								<div
									style={{
										borderTop: "1px solid var(--border)",
										margin: "4px 0",
									}}
								/>
								<div style={{ padding: "4px 12px 2px", ...sectionLabel }}>GROUP BY</div>
								{(
									[
										["status", "Status"],
										["location", "Location"],
									] as [GroupMode, string][]
								).map(([val, label]) => (
									<button
										type="button"
										key={val}
										onClick={() => {
											setGroupMode(val);
											localStorage.setItem("sidebar-group-mode", val);
										}}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											width: "100%",
											background: "none",
											border: "none",
											color: "var(--text-secondary)",
											fontSize: 12,
											textAlign: "left",
											padding: "5px 12px",
											cursor: "pointer",
											fontFamily: "inherit",
										}}
										onMouseEnter={(e) => (e.currentTarget.style.background = "var(--item-hover)")}
										onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
									>
										<span
											style={{
												width: 6,
												height: 6,
												borderRadius: "50%",
												background: groupMode === val ? "var(--accent)" : "transparent",
												border: `1.5px solid ${groupMode === val ? "var(--accent)" : "var(--text-very-muted)"}`,
												flexShrink: 0,
											}}
										/>
										{label}
									</button>
								))}
							</div>
						)}
					</div>
					<button
						type="button"
						onClick={onOpenNewSession}
						aria-label="New session"
						title="New session (⌘⇧N)"
						style={{ ...iconBtn, fontSize: 18, color: "var(--accent)" }}
						onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
						onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent)")}
					>
						+
					</button>
				</div>
			</div>

			{/* Search */}
			<div style={{ padding: "0 8px 4px", flexShrink: 0, position: "relative" }}>
				{!sidebarSearch && (
					<div
						style={{
							position: "absolute",
							top: 0,
							left: 8,
							right: 8,
							padding: "4px 8px",
							fontSize: 11,
							fontFamily: "inherit",
							pointerEvents: "none",
							lineHeight: "normal",
						}}
					>
						<span style={{ color: "var(--text-muted)" }}>Search</span>
						<span style={{ color: "var(--text-very-muted)" }}> (@group: @tab: @folder:)</span>
					</div>
				)}
				<input
					ref={searchRef}
					aria-label="Search sessions and groups"
					value={sidebarSearch}
					onChange={(e) => setSidebarSearch(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							setSidebarSearch("");
							searchRef.current?.blur();
						}
					}}
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
					style={{
						width: "100%",
						background: sidebarSearch ? "var(--bg-main)" : "transparent",
						border: "1px solid var(--border)",
						borderRadius: 5,
						color: "var(--text-primary)",
						fontSize: 11,
						padding: "4px 8px",
						outline: "none",
						fontFamily: "inherit",
					}}
				/>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto" style={{ paddingTop: 4 }}>
				{/* ── GROUPS SECTION ── */}
				<div style={{ padding: "0 4px 8px" }}>
					<div
						data-drop="new-group"
						style={{
							display: "flex",
							alignItems: "center",
							padding: "2px 8px",
							gap: 4,
						}}
					>
						<button
							type="button"
							aria-label={`${groupsCollapsed ? "Expand" : "Collapse"} groups section`}
							aria-expanded={!groupsCollapsed}
							onClick={() => setGroupsCollapsed((c) => !c)}
							style={{
								...sectionLabel,
								background: "none",
								border: "none",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: 0,
								fontFamily: "inherit",
								flex: 1,
								textAlign: "left",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
							onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
						>
							<span
								style={{
									display: "inline-block",
									transform: groupsCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
									transition: "transform 0.1s",
									fontSize: 8,
								}}
							>
								▾
							</span>
							GROUPS
						</button>
						<button
							type="button"
							onClick={onCreateGroup}
							title="New group"
							style={{ ...iconBtn, fontSize: 15, color: "var(--text-muted)" }}
							onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
							onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
						>
							+
						</button>
					</div>

					{!groupsCollapsed &&
						filteredGroups.map((group) => {
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
										onClick={() => {
											if (!isRenamingGroup) {
												onActivateGroup(group.id);
											}
										}}
										onMouseEnter={(e) => {
											if (!isActive) {
												e.currentTarget.style.background = "var(--item-hover)";
											}
										}}
										onMouseLeave={(e) => {
											if (!isActive) {
												e.currentTarget.style.background = "none";
											}
										}}
										onDoubleClick={() => startRenameGroup(group)}
									>
										<button
											type="button"
											aria-label={`${isCollapsedGroup ? "Expand" : "Collapse"} group ${group.name}`}
											aria-expanded={!isCollapsedGroup}
											onClick={(e) => {
												e.stopPropagation();
												setCollapsed((c) => ({
													...c,
													[group.id]: !c[group.id],
												}));
											}}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												padding: "4px",
												color: "var(--text-very-muted)",
												fontSize: 8,
												lineHeight: 1,
												flexShrink: 0,
											}}
										>
											<span
												style={{
													display: "inline-block",
													transform: isCollapsedGroup ? "rotate(-90deg)" : "rotate(0deg)",
													transition: "transform 0.1s",
												}}
											>
												▾
											</span>
										</button>

										{isRenamingGroup ? (
											<input
												ref={renameGroupInputRef}
												value={renameGroupValue}
												onChange={(e) => setRenameGroupValue(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														commitRenameGroup(group.id);
													}
													if (e.key === "Escape") {
														e.preventDefault();
														setRenamingGroupId(null);
													}
												}}
												onBlur={() => commitRenameGroup(group.id)}
												onClick={(e) => e.stopPropagation()}
												style={{
													flex: 1,
													background: "var(--bg-main)",
													border: "1px solid var(--accent)",
													borderRadius: 3,
													color: "var(--text-primary)",
													fontSize: 12,
													padding: "1px 4px",
													outline: "none",
													fontFamily: "inherit",
												}}
											/>
										) : (
											<span
												style={{
													flex: 1,
													fontSize: 12,
													fontWeight: isActive ? 500 : 400,
													color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{group.name}
											</span>
										)}

										{/* Layout picker button */}
										<div style={{ position: "relative", flexShrink: 0 }}>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													setLayoutPickerGroupId(showLayoutPicker ? null : group.id);
												}}
												aria-label={`Change layout for ${group.name}`}
												title="Change layout"
												style={{
													...iconBtn,
													fontSize: 9,
													fontWeight: 600,
													letterSpacing: "0.04em",
													color: "var(--text-very-muted)",
													padding: "2px 5px",
													border: "1px solid var(--border)",
													borderRadius: 3,
												}}
												onMouseEnter={(e) =>
													(e.currentTarget.style.color = "var(--text-secondary)")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.color = "var(--text-very-muted)")
												}
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
														maxWidth: "calc(100vw - 40px)",
														overflowX: "auto",
													}}
												>
													{(() => {
														const occupied = group.slots.filter(Boolean).length;
														return enabledLayouts.map((l) => {
															const tooSmall = SLOT_COUNTS[l] < occupied;
															const isActive = l === group.layout;
															return (
																<button
																	type="button"
																	key={l}
																	disabled={tooSmall}
																	onClick={() => {
																		if (!tooSmall) {
																			onChangeLayout(group.id, l);
																			setLayoutPickerGroupId(null);
																		}
																	}}
																	title={
																		tooSmall
																			? `${l} — not enough slots (${SLOT_COUNTS[l]} < ${occupied} sessions)`
																			: l
																	}
																	style={{
																		background: isActive ? "var(--accent)" : "var(--bg-main)",
																		border: "1px solid var(--border)",
																		borderRadius: 4,
																		padding: "5px 6px",
																		cursor: tooSmall ? "not-allowed" : "pointer",
																		color: isActive
																			? "var(--bg-main)"
																			: tooSmall
																				? "var(--text-very-muted)"
																				: "var(--text-muted)",
																		display: "flex",
																		flexDirection: "column",
																		alignItems: "center",
																		gap: 3,
																		opacity: tooSmall ? 0.4 : 1,
																		textDecoration: tooSmall ? "line-through" : "none",
																	}}
																>
																	<LayoutIcon layout={l} />
																	<span
																		style={{
																			fontSize: 8,
																			letterSpacing: "0.02em",
																			fontWeight: 600,
																		}}
																	>
																		{l}
																	</span>
																</button>
															);
														});
													})()}
												</div>
											)}
										</div>

										{/* Delete group */}
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onDeleteGroup(group.id);
											}}
											aria-label={`Delete group ${group.name}`}
											title="Remove group"
											style={{
												...iconBtn,
												fontSize: 13,
												flexShrink: 0,
												color: "var(--text-very-muted)",
												opacity: 0,
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.opacity = "1";
												e.currentTarget.style.color = "#f87171";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.opacity = "0";
												e.currentTarget.style.color = "var(--text-very-muted)";
											}}
										>
											×
										</button>
									</div>

									{/* Group slots */}
									{!isCollapsedGroup && (
										<div style={{ paddingLeft: 16, paddingTop: 2 }}>
											{group.slots.map((sessionId, slotIdx) => {
												const session = sessionId
													? (sessions.find((s) => s.session_id === sessionId) ?? null)
													: null;
												const isSlotSelected = sessionId !== null && sessionId === selectedId;

												return (
													<div
														key={slotIdx}
														data-drop="group-slot"
														data-group-id={group.id}
														data-slot-idx={slotIdx}
														{...(session
															? {
																	"data-drag": "session",
																	"data-drag-id": session.session_id,
																	"data-drag-label": session.display_name || session.project_name,
																}
															: {})}
														style={{
															display: "flex",
															alignItems: "center",
															height: 24,
															borderRadius: 4,
															padding: "0 8px",
															gap: 6,
															background: isSlotSelected
																? "color-mix(in srgb, var(--item-selected) 50%, transparent)"
																: "none",
															cursor: session ? "grab" : "default",
															userSelect: "none",
															transition: "all 0.1s",
														}}
														onClick={() => {
															if (session) {
																onActivateGroupAtSlot(group.id, slotIdx);
															}
														}}
														onContextMenu={
															session
																? (e) => {
																		e.preventDefault();
																		e.stopPropagation();
																		setGroupSlotContextMenu({
																			sessionId: session.session_id,
																			x: e.clientX,
																			y: e.clientY,
																		});
																	}
																: undefined
														}
														onMouseEnter={(e) => {
															if (session && !isSlotSelected) {
																e.currentTarget.style.background = "var(--item-hover)";
															}
															if (group.id === activeGroupId) {
																onHoverSlot(slotIdx);
															}
														}}
														onMouseLeave={(e) => {
															if (!isSlotSelected && !(e.buttons & 1)) {
																e.currentTarget.style.background = "none";
															}
															onHoverSlot(null);
														}}
													>
														<span
															style={{
																fontSize: 9,
																color: "var(--accent)",
																fontWeight: 700,
																flexShrink: 0,
																pointerEvents: "none",
															}}
														>
															{slotIdx + 1}
														</span>
														{session ? (
															<>
																<StatusDot
																	status={session.status}
																	activity={activityMap.get(session.session_id)}
																	unread={unreadSessions.has(session.session_id)}
																	size={5}
																/>
																<span
																	style={{
																		fontSize: 11,
																		color: isSlotSelected
																			? "var(--text-primary)"
																			: "var(--text-secondary)",
																		fontWeight: isSlotSelected ? 500 : 400,
																		overflow: "hidden",
																		textOverflow: "ellipsis",
																		whiteSpace: "nowrap",
																		flex: 1,
																		pointerEvents: "none",
																	}}
																>
																	{session.display_name ||
																		`${session.project_name}-${session.session_id.slice(0, 5)}`}
																</span>
															</>
														) : (
															<span
																style={{
																	fontSize: 11,
																	color: "var(--text-very-muted)",
																	fontStyle: "italic",
																	pointerEvents: "none",
																}}
															>
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
						<div
							data-drop="new-group"
							style={{
								padding: "4px 12px 4px",
								fontSize: 11,
								color: "var(--text-very-muted)",
								fontStyle: "italic",
							}}
						>
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
					<span
						style={{
							fontSize: 10,
							color: "var(--text-very-muted)",
							fontWeight: 600,
							letterSpacing: "0.04em",
							pointerEvents: "none",
						}}
					>
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
									type="button"
									aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.label} sessions`}
									aria-expanded={!isCollapsed}
									onClick={() =>
										setCollapsed((c) => ({
											...c,
											[group.label]: !c[group.label],
										}))
									}
									className="flex items-center gap-1 w-full px-4 py-1"
									style={{
										background: "none",
										border: "none",
										cursor: "pointer",
										color: "var(--text-muted)",
										fontSize: 10,
										fontWeight: 600,
										letterSpacing: "0.06em",
										textAlign: "left",
									}}
									onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
									onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
								>
									<span
										style={{
											display: "inline-block",
											transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
											transition: "transform 0.1s",
											fontSize: 8,
											marginRight: 2,
										}}
									>
										▾
									</span>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											maxWidth: 160,
										}}
									>
										{group.label}
									</span>
									<span
										style={{
											marginLeft: "auto",
											fontVariantNumeric: "tabular-nums",
											flexShrink: 0,
										}}
									>
										{group.sessions.length}
									</span>
								</button>

								{!isCollapsed &&
									group.sessions.map((session) => {
										const isSelected = session.session_id === selectedId;
										const isRenaming = renamingId === session.session_id;
										const name =
											session.display_name ||
											`${session.project_name}-${session.session_id.slice(0, 5)}`;
										const activity = activityMap.get(session.session_id);
										const rowTint =
											activity === "computing"
												? "rgba(245,158,11,0.07)"
												: activity === "waiting"
													? "rgba(34,197,94,0.07)"
													: undefined;

										return (
											<div
												key={session.session_id}
												ref={(el) => {
													if (el) {
														itemRefs.current.set(session.session_id, el);
													} else {
														itemRefs.current.delete(session.session_id);
													}
												}}
												data-drop="session"
												data-session-id={session.session_id}
												{...(!isRenaming
													? {
															"data-drag": "session",
															"data-drag-id": session.session_id,
															"data-drag-label": name,
														}
													: {})}
												style={{
													display: "flex",
													alignItems: "center",
													gap: 8,
													height: 30,
													background: isSelected
														? "color-mix(in srgb, var(--item-selected) 50%, transparent)"
														: (rowTint ?? "none"),
													borderRadius: 4,
													margin: "0 4px",
													padding: "0 12px",
													cursor: "grab",
													userSelect: "none",
													transition: "background 0.05s",
												}}
												onMouseEnter={(e) => {
													if (!isSelected)
														e.currentTarget.style.background = rowTint ?? "var(--item-hover)";
												}}
												onMouseLeave={(e) => {
													if (!isSelected && !(e.buttons & 1))
														e.currentTarget.style.background = rowTint ?? "none";
												}}
												onClick={() => {
													if (!isRenaming) {
														onSelect(session);
													}
												}}
												onDoubleClick={() => {
													if (!isRenaming) {
														startRename(session);
													}
												}}
												onContextMenu={(e) => {
													e.preventDefault();
													e.stopPropagation();
													setContextMenu({
														sessionId: session.session_id,
														x: e.clientX,
														y: e.clientY,
													});
												}}
											>
												<StatusDot
													status={session.status}
													activity={activity}
													unread={unreadSessions.has(session.session_id)}
													size={7}
												/>
												{isRenaming ? (
													<input
														ref={renameInputRef}
														value={renameValue}
														onChange={(e) => setRenameValue(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																commitRename(session.session_id);
															}
															if (e.key === "Escape") {
																e.preventDefault();
																setRenamingId(null);
															}
														}}
														onBlur={() => commitRename(session.session_id)}
														onClick={(e) => e.stopPropagation()}
														style={{
															flex: 1,
															background: "var(--bg-main)",
															border: "1px solid var(--accent)",
															borderRadius: 3,
															color: "var(--text-primary)",
															fontSize: 13,
															padding: "1px 4px",
															outline: "none",
															fontFamily: "inherit",
														}}
													/>
												) : (
													<span
														style={{
															flex: 1,
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															fontWeight: isSelected ? 500 : 400,
															color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
															fontSize: 13,
														}}
													>
														{name}
													</span>
												)}
												{!isRenaming && session.git_branch && (
													<span
														style={{
															color: "var(--text-very-muted)",
															fontSize: 10,
															flexShrink: 0,
															maxWidth: 80,
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
														}}
													>
														{session.project_name}/{session.git_branch}
													</span>
												)}
												{!isRenaming && (
													<span
														style={{
															color: "var(--text-very-muted)",
															fontSize: 11,
															flexShrink: 0,
														}}
													>
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
						<div
							className="px-4 py-8 text-center"
							style={{ color: "var(--text-muted)", fontSize: 12 }}
						>
							No Claude Code sessions found.
							<br />
							<span style={{ fontSize: 11, marginTop: 4, display: "block" }}>
								Start one in your terminal.
							</span>
						</div>
					)}
				</div>
				{/* end sessions wrapper */}
			</div>

			{/* Footer */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					padding: "0 12px",
					gap: 12,
					height: 28,
					borderTop: "1px solid var(--border)",
					color: "var(--text-muted)",
					fontSize: 11,
					flexShrink: 0,
				}}
			>
				<button
					type="button"
					aria-label="Command palette"
					onClick={onOpenPalette}
					style={{
						background: "none",
						border: "none",
						color: "var(--text-muted)",
						cursor: "pointer",
						fontSize: 12,
						padding: "4px",
						fontFamily: "inherit",
						fontWeight: 500,
					}}
					onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
					onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
				>
					⌘K
				</button>
				<button
					type="button"
					aria-label="Settings"
					onClick={onOpenSettings}
					title="Preferences (⌘P)"
					style={{
						marginLeft: "auto",
						background: "none",
						border: "none",
						color: "var(--text-muted)",
						cursor: "pointer",
						fontSize: 14,
						padding: "4px",
						fontFamily: "inherit",
						fontWeight: 500,
					}}
					onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
					onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
				>
					?
				</button>
			</div>

			{/* Group slot context menu */}
			{groupSlotContextMenu && (
				<div
					onClick={(e) => e.stopPropagation()}
					style={{
						position: "fixed",
						left: groupSlotContextMenu.x,
						top: groupSlotContextMenu.y,
						background: "var(--bg-sidebar)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
						zIndex: 1000,
						minWidth: 140,
						padding: "4px 0",
					}}
				>
					<button
						type="button"
						onClick={() => {
							onRemoveFromGroup(groupSlotContextMenu.sessionId);
							setGroupSlotContextMenu(null);
						}}
						style={{
							display: "block",
							width: "100%",
							background: "none",
							border: "none",
							color: "var(--text-secondary)",
							fontSize: 13,
							textAlign: "left",
							padding: "6px 12px",
							cursor: "pointer",
							fontFamily: "inherit",
						}}
						onMouseEnter={(e) => (e.currentTarget.style.background = "var(--item-hover)")}
						onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
					>
						Remove from group
					</button>
				</div>
			)}

			{/* Context menu */}
			{contextMenu &&
				(() => {
					const session = sessions.find((s) => s.session_id === contextMenu.sessionId);
					if (!session) {
						return null;
					}
					return (
						<div
							role="menu"
							aria-label="Session actions"
							onClick={(e) => e.stopPropagation()}
							style={{
								position: "fixed",
								left: contextMenu.x,
								top: contextMenu.y,
								background: "var(--bg-sidebar)",
								border: "1px solid var(--border)",
								borderRadius: 6,
								boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
								zIndex: 1000,
								minWidth: 140,
								padding: "4px 0",
							}}
						>
							{(["Rename", "Archive", "Delete"] as const).map((action) => (
								<button
									type="button"
									key={action}
									role="menuitem"
									onClick={() => {
										if (action === "Rename") {
											startRename(session);
										} else if (action === "Archive") {
											archiveSession(session.session_id);
										} else if (action === "Delete") {
											deleteSession(session.session_id);
										}
									}}
									style={{
										display: "block",
										width: "100%",
										background: "none",
										border: "none",
										color: action === "Delete" ? "#f87171" : "var(--text-secondary)",
										fontSize: 13,
										textAlign: "left",
										padding: "6px 12px",
										cursor: "pointer",
										fontFamily: "inherit",
									}}
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
