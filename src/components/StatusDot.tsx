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
	if (activity === "computing") {
		return (
			<span
				className="pty-computing"
				role="status"
				aria-label="Computing"
				title="Computing"
				style={{
					display: "inline-block",
					width: size,
					height: size,
					borderRadius: "50%",
					backgroundColor: "var(--status-computing, #f59e0b)",
					flexShrink: 0,
				}}
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
					display: "inline-block",
					width: size,
					height: size,
					borderRadius: "50%",
					backgroundColor: "var(--status-unread, #3b82f6)",
					flexShrink: 0,
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
					display: "inline-block",
					width: size,
					height: size,
					borderRadius: "50%",
					backgroundColor: "var(--status-waiting, #22c55e)",
					flexShrink: 0,
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
				display: "inline-block",
				width: size,
				height: size,
				borderRadius: "50%",
				backgroundColor: isActive ? "var(--status-active, #4ade80)" : "var(--text-very-muted)",
				flexShrink: 0,
			}}
		/>
	);
}
