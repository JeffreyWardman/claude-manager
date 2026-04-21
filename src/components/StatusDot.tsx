import type { ActivityState } from "../hooks/usePtyActivity";
import type { SessionStatus } from "../types";

interface Props {
	status: SessionStatus;
	activity?: ActivityState;
	unread?: boolean;
	focused?: boolean;
	size?: number;
}

export function StatusDot({ status, activity, unread, focused, size = 8 }: Props) {
	const base: React.CSSProperties = {
		display: "inline-block",
		width: size,
		height: size,
		borderRadius: "50%",
		flexShrink: 0,
	};

	if (activity === "computing") {
		return (
			<span
				className="pty-computing"
				role="status"
				aria-label="Computing"
				title="Computing"
				style={{ ...base, backgroundColor: "var(--status-computing, #f59e0b)" }}
			/>
		);
	}

	if (unread) {
		return (
			<span
				role="status"
				aria-label="Completed, unread"
				title="Completed (unread)"
				style={{
					...base,
					backgroundColor: "var(--status-unread, #3b82f6)",
					boxShadow: "0 0 4px color-mix(in srgb, var(--status-unread, #3b82f6) 50%, transparent)",
				}}
			/>
		);
	}

	if (activity === "waiting" && !focused) {
		return (
			<span
				role="status"
				aria-label="Waiting for input"
				title="Waiting for input"
				style={{
					...base,
					backgroundColor: "var(--status-waiting, #22c55e)",
					boxShadow: "0 0 4px color-mix(in srgb, var(--status-waiting, #22c55e) 50%, transparent)",
				}}
			/>
		);
	}

	const isActive = status === "active";

	return (
		<span
			role="status"
			aria-label={isActive ? "Active" : "Offline"}
			title={isActive ? "Active" : "Offline"}
			style={{
				...base,
				backgroundColor: isActive ? "var(--status-active, #4ade80)" : "var(--text-very-muted)",
			}}
		/>
	);
}
