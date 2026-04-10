import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { ClaudeSession } from "../types";
import { formatCwd, modalBackdropStyle, modalDialogStyle, sessionDisplayName } from "../utils";
import { StatusDot } from "./StatusDot";

interface Props {
	sessions: ClaudeSession[];
	onSelect: (session: ClaudeSession) => void;
	onClose: () => void;
}

export function CommandPalette({ sessions, onSelect, onClose }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState("");

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const dialogRef = useRef<HTMLDivElement>(null);
	useFocusTrap(dialogRef, onClose);

	const active = sessions.filter((s) => s.status === "active");

	const offline = sessions.filter((s) => s.status === "offline");

	const handleSelect = (sessionId: string) => {
		const session = sessions.find((s) => s.session_id === sessionId);
		if (session) {
			onSelect(session);
			onClose();
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
			style={modalBackdropStyle}
			onClick={onClose}
		>
			<div ref={dialogRef} onClick={(e) => e.stopPropagation()} style={modalDialogStyle}>
				<Command value={value} onValueChange={setValue} style={{ background: "transparent" }}>
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
						<Command.Input
							ref={inputRef}
							aria-label="Search sessions"
							placeholder="Search sessions..."
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
						<Command.Empty
							style={{
								padding: "24px 14px",
								color: "var(--text-muted)",
								fontSize: 13,
								textAlign: "center",
							}}
						>
							No sessions found.
						</Command.Empty>

						{active.length > 0 && (
							<Command.Group heading="ACTIVE" style={{ padding: "0" }}>
								{active.map((s) => (
									<SessionItem key={s.session_id} session={s} onSelect={handleSelect} />
								))}
							</Command.Group>
						)}

						{offline.length > 0 && (
							<Command.Group heading="OFFLINE">
								{offline.slice(0, 15).map((s) => (
									<SessionItem key={s.session_id} session={s} onSelect={handleSelect} />
								))}
							</Command.Group>
						)}
					</Command.List>
				</Command>
			</div>
		</div>
	);
}

function SessionItem({
	session,
	onSelect,
}: {
	session: ClaudeSession;
	onSelect: (id: string) => void;
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
