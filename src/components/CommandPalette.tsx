import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { ClaudeSession, PaneGroup } from "../types";
import {
	formatCwd,
	modalBackdropStyle,
	modalDialogStyle,
	noAutocorrect,
	sessionDisplayName,
} from "../utils";
import { StatusDot } from "./StatusDot";

type PaletteTab = "actions" | "sessions";

interface Props {
	sessions: ClaudeSession[];
	groups: PaneGroup[];
	onSelect: (session: ClaudeSession) => void;
	onClearEmptyGroups: () => void;
	onDeleteAllGroups: () => void;
	onClose: () => void;
}

export function CommandPalette({
	sessions,
	groups,
	onSelect,
	onClearEmptyGroups,
	onDeleteAllGroups,
	onClose,
}: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState("");
	const [tab, setTab] = useState<PaletteTab>("actions");

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const dialogRef = useRef<HTMLDivElement>(null);
	useFocusTrap(dialogRef, onClose);

	const [search, setSearch] = useState("");

	const emptyGroupCount = groups.filter((g) => g.slots.every((s) => s === null)).length;

	const actions: { label: string; detail: string; onSelect: () => void }[] = [];
	if (emptyGroupCount > 0) {
		actions.push({
			label: "Clear empty groups",
			detail: `${emptyGroupCount} group${emptyGroupCount !== 1 ? "s" : ""}`,
			onSelect: () => {
				onClearEmptyGroups();
				onClose();
			},
		});
	}
	if (groups.length > 0) {
		actions.push({
			label: "Delete all groups",
			detail: `${groups.length} group${groups.length !== 1 ? "s" : ""}`,
			onSelect: () => {
				onDeleteAllGroups();
				onClose();
			},
		});
	}

	const lowerSearch = search.toLowerCase();
	const filteredActions = lowerSearch
		? actions.filter((a) => a.label.toLowerCase().includes(lowerSearch))
		: actions;

	const matchSession = (s: ClaudeSession) => {
		if (!lowerSearch) {
			return true;
		}
		const name = sessionDisplayName(s).toLowerCase();
		const cwd = s.cwd.toLowerCase();
		const branch = (s.git_branch ?? "").toLowerCase();
		return name.includes(lowerSearch) || cwd.includes(lowerSearch) || branch.includes(lowerSearch);
	};
	const active = sessions.filter((s) => s.status === "active" && matchSession(s));
	const offline = sessions.filter((s) => s.status === "offline" && matchSession(s));
	const filteredSessions = [...active, ...offline.slice(0, 15)];

	const handleSelect = (sessionId: string) => {
		const session = sessions.find((s) => s.session_id === sessionId);
		if (session) {
			onSelect(session);
			onClose();
		}
	};

	const tabStyle = (active: boolean): React.CSSProperties => ({
		background: "none",
		border: "none",
		cursor: "pointer",
		fontSize: 11,
		fontWeight: active ? 600 : 400,
		color: active ? "var(--text-secondary)" : "var(--text-muted)",
		padding: "4px 8px",
		letterSpacing: "0.04em",
		fontFamily: "inherit",
	});

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
			style={modalBackdropStyle}
			onClick={onClose}
		>
			<div
					ref={dialogRef}
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						if (e.key === "Tab") {
							e.preventDefault();
							e.stopPropagation();
							setTab((t) => (t === "actions" ? "sessions" : "actions"));
							return;
						}
						if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
							e.preventDefault();
							const idx = Number.parseInt(e.key) - 1;
							if (tab === "actions") {
								filteredActions[idx]?.onSelect();
							} else {
								const s = filteredSessions[idx];
								if (s) {
									handleSelect(s.session_id);
								}
							}
						}
					}}
					style={modalDialogStyle}
				>
				<Command
					value={value}
					onValueChange={setValue}
					shouldFilter={false}
					style={{ background: "transparent" }}
				>
					{/* Tab bar */}
					<div
						role="tablist"
						aria-label="Palette mode"
						style={{
							display: "flex",
							alignItems: "center",
							padding: "4px 10px 0",
							gap: 0,
						}}
					>
						<button
							type="button"
							role="tab"
							tabIndex={-1}
							aria-selected={tab === "actions"}
							onClick={() => setTab("actions")}
							style={tabStyle(tab === "actions")}
						>
							ACTIONS
						</button>
						<span
							style={{ color: "var(--text-very-muted)", fontSize: 10 }}
							aria-hidden="true"
						>
							|
						</span>
						<button
							type="button"
							role="tab"
							tabIndex={-1}
							aria-selected={tab === "sessions"}
							onClick={() => setTab("sessions")}
							style={tabStyle(tab === "sessions")}
						>
							SESSIONS
						</button>
						<span
							style={{
								marginLeft: "auto",
								fontSize: 9,
								color: "var(--text-very-muted)",
								letterSpacing: "0.02em",
							}}
						>
							tab to switch
						</span>
					</div>

					{/* Search input */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "10px 14px",
							borderBottom: "1px solid var(--border)",
						}}
					>
						<span style={{ color: "var(--text-muted)", fontSize: 15 }}>⌕</span>
						<input
							ref={inputRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							{...noAutocorrect}
							aria-label={
								tab === "actions" ? "Search actions" : "Search sessions"
							}
							placeholder={
								tab === "actions"
									? "Search actions..."
									: "Search sessions..."
							}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									onClose();
								}
							}}
							style={{
								flex: 1,
								background: "none",
								border: "none",
								outline: "none",
								color: "var(--text-primary)",
								fontSize: 14,
								fontFamily: "inherit",
							}}
						/>
						<span style={{ color: "var(--text-muted)", fontSize: 11 }}>esc</span>
					</div>

					<Command.List
						style={{
							maxHeight: 360,
							overflowY: "auto",
							padding: "4px 0",
						}}
					>
						{((tab === "actions" && filteredActions.length === 0) ||
							(tab === "sessions" && filteredSessions.length === 0)) && (
							<div
								style={{
									padding: "24px 14px",
									color: "var(--text-muted)",
									fontSize: 13,
									textAlign: "center",
								}}
							>
								{tab === "actions"
									? "No actions available."
									: "No sessions found."}
							</div>
						)}

						{tab === "actions" &&
							filteredActions.map((action, i) => (
								<Command.Item
									key={action.label}
									value={action.label}
									onSelect={action.onSelect}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										padding: "6px 14px",
										cursor: "pointer",
										fontSize: 13,
										color: "var(--text-secondary)",
										outline: "none",
									}}
								>
									<span style={{ fontSize: 9, color: "var(--text-very-muted)", minWidth: 20, textAlign: "center", fontFamily: "inherit" }}>
										{i < 9 ? `⌘${i + 1}` : ""}
									</span>
									<span style={{ flex: 1, fontWeight: 500, color: "var(--text-primary)" }}>
										{action.label}
									</span>
									<span style={{ fontSize: 11, color: "var(--text-muted)" }}>
										{action.detail}
									</span>
								</Command.Item>
							))}

						{tab === "sessions" &&
							filteredSessions.map((s, i) => (
								<SessionItem
									key={s.session_id}
									session={s}
									onSelect={handleSelect}
									idx={i}
								/>
							))}
					</Command.List>
				</Command>
			</div>
		</div>
	);
}

function SessionItem({
	session,
	onSelect,
	idx,
}: {
	session: ClaudeSession;
	onSelect: (id: string) => void;
	idx: number;
}) {
	const name = sessionDisplayName(session);
	return (
		<Command.Item
			value={`${name} ${session.cwd} ${session.git_branch ?? ""}`}
			onSelect={() => onSelect(session.session_id)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "6px 14px",
				cursor: "pointer",
				fontSize: 13,
				color: "var(--text-secondary)",
				outline: "none",
			}}
			data-selected-style={{
				background: "var(--item-selected)",
				color: "var(--text-primary)",
			}}
		>
			<span style={{ fontSize: 9, color: "var(--text-very-muted)", minWidth: 20, textAlign: "center", fontFamily: "inherit" }}>
				{idx < 9 ? `⌘${idx + 1}` : ""}
			</span>
			<StatusDot status={session.status} size={7} />
			<span style={{ flex: 1, fontWeight: 500, color: "var(--text-primary)" }}>{name}</span>
			<span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatCwd(session.cwd)}</span>
			{session.git_branch && (
				<span
					style={{
						fontSize: 10,
						color: "var(--text-very-muted)",
						maxWidth: 80,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{session.git_branch}
				</span>
			)}
		</Command.Item>
	);
}
