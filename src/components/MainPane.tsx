import { useEffect, useState } from "react";
import type { ActivityState } from "../hooks/usePtyActivity";
import type { ClaudeSession } from "../types";
import { StatusDot } from "./StatusDot";
import { TerminalPane } from "./TerminalPane";

interface Props {
	session: ClaudeSession | null;
	gridSlotIdx?: number;
	onGridClose?: () => void;
	activityMap?: Map<string, ActivityState>;
	unreadSessions?: Set<string>;
	focused?: boolean;
}

function formatCwd(cwd: string): string {
	return cwd.replace(/^\/Users\/[^/]+/, "~");
}

type View = "claude" | "terminal" | "split";

export function MainPane({
	session,
	gridSlotIdx,
	onGridClose,
	activityMap,
	unreadSessions,
	focused,
}: Props) {
	const [view, setView] = useState<View>("claude");

	useEffect(() => {
		setView("claude");
	}, []);

	if (!session) {
		return (
			<div
				data-tauri-drag-region
				className="flex flex-col items-center justify-center flex-1 h-full"
				style={{ color: "var(--text-very-muted)" }}
			>
				<div style={{ fontSize: 32, marginBottom: 12, pointerEvents: "none" }}>◆</div>
				<div style={{ fontSize: 13, pointerEvents: "none" }}>Select a session</div>
				<div
					style={{
						fontSize: 11,
						marginTop: 4,
						color: "var(--text-very-muted)",
						pointerEvents: "none",
					}}
				>
					or press N to start a new one
				</div>
			</div>
		);
	}

	const shellId = `${session.session_id}-shell`;

	const tabStyle = (active: boolean) => ({
		background: "none",
		border: "none",
		cursor: "pointer",
		fontSize: 11,
		fontWeight: active ? 500 : 400,
		color: active ? "var(--text-secondary)" : "var(--text-muted)",
		padding: "4px 8px",
		minHeight: 24,
		letterSpacing: "0.04em",
	});

	const showClaude = view === "claude" || view === "split";
	const showShell = view === "terminal" || view === "split";

	const inGrid = gridSlotIdx !== undefined;

	return (
		<div className="flex flex-col flex-1 h-full" style={{ background: "var(--bg-main)" }}>
			{/* Header */}
			<div
				{...(!inGrid ? { "data-tauri-drag-region": true } : {})}
				{...(inGrid
					? {
							"data-drag": "pane",
							"data-drag-idx": String(gridSlotIdx),
							"data-drag-label": session.display_name || session.project_name,
						}
					: {})}
				className="flex items-center gap-2 px-4"
				style={{
					height: inGrid ? 40 : 56,
					paddingTop: inGrid ? 0 : 28,
					borderBottom: "1px solid var(--border)",
					flexShrink: 0,
					cursor: inGrid ? "grab" : undefined,
				}}
			>
				{inGrid && (
					<span
						style={{
							fontSize: 10,
							color: "var(--text-very-muted)",
							userSelect: "none",
							marginRight: 2,
						}}
					>
						⠿
					</span>
				)}
				<StatusDot
					status={session.status}
					activity={activityMap?.get(session.session_id)}
					unread={unreadSessions?.has(session.session_id)}
					focused={focused}
					size={8}
				/>
				<div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
					<span
						style={{
							fontSize: 13,
							fontWeight: 500,
							color: "var(--text-primary)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{session.display_name || `${session.project_name}-${session.session_id.slice(0, 5)}`}
					</span>
					<span
						style={{
							fontSize: 10,
							color: "var(--text-very-muted)",
							lineHeight: 1.2,
						}}
					>
						{formatCwd(session.cwd)}
						{session.pid > 0 ? ` · pid ${session.pid}` : ""}
					</span>
				</div>

				{/* View tabs */}
				<div
					role="tablist"
					aria-label="View mode"
					style={{
						marginLeft: "auto",
						display: "flex",
						alignItems: "center",
						gap: 4,
					}}
				>
					<button
						type="button"
						role="tab"
						aria-selected={view === "claude"}
						style={tabStyle(view === "claude")}
						onClick={() => setView("claude")}
						onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
						onMouseLeave={(e) =>
							(e.currentTarget.style.color =
								view === "claude" ? "var(--text-secondary)" : "var(--text-muted)")
						}
					>
						CLAUDE
					</button>
					<span aria-hidden="true" style={{ color: "var(--text-very-muted)", fontSize: 10 }}>
						|
					</span>
					<button
						type="button"
						role="tab"
						aria-selected={view === "terminal"}
						style={tabStyle(view === "terminal")}
						onClick={() => setView("terminal")}
						onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
						onMouseLeave={(e) =>
							(e.currentTarget.style.color =
								view === "terminal" ? "var(--text-secondary)" : "var(--text-muted)")
						}
					>
						TERMINAL
					</button>
					<span aria-hidden="true" style={{ color: "var(--text-very-muted)", fontSize: 10 }}>
						|
					</span>
					<button
						type="button"
						role="tab"
						aria-selected={view === "split"}
						aria-label="Split view"
						style={{ ...tabStyle(view === "split"), fontSize: 15 }}
						onClick={() => setView((v) => (v === "split" ? "claude" : "split"))}
						title="Split view"
						onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
						onMouseLeave={(e) =>
							(e.currentTarget.style.color =
								view === "split" ? "var(--text-secondary)" : "var(--text-muted)")
						}
					>
						⧉
					</button>
					{onGridClose && (
						<button
							type="button"
							aria-label="Remove from grid"
							onClick={(e) => {
								e.stopPropagation();
								onGridClose();
							}}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								fontSize: 14,
								color: "var(--text-very-muted)",
								padding: "4px 6px",
								minHeight: 24,
								minWidth: 24,
								marginLeft: 4,
								lineHeight: 1,
							}}
							onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
							onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-very-muted)")}
						>
							×
						</button>
					)}
				</div>
			</div>

			{/* Content */}
			<div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
				{showClaude && (
					<div
						style={{
							flex: 1,
							minWidth: 0,
							borderRight: showShell ? "1px solid var(--border)" : undefined,
						}}
					>
						<TerminalPane ptyId={session.session_id} cwd={session.cwd} />
					</div>
				)}
				{showShell && (
					<div style={{ flex: 1, minWidth: 0 }}>
						<TerminalPane ptyId={shellId} cwd={session.cwd} cmd="/bin/zsh" />
					</div>
				)}
			</div>
		</div>
	);
}
