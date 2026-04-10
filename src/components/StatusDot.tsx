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
					backgroundColor: "#f59e0b",
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
					backgroundColor: "#3b82f6",
					flexShrink: 0,
					boxShadow: "0 0 4px #3b82f688",
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
					backgroundColor: "#22c55e",
					flexShrink: 0,
					boxShadow: "0 0 4px #22c55e88",
				}}
			/>
		);
	}

	const color = status === "active" ? "#4ade80" : "#6b7280";
	const label = status === "active" ? "Active" : "Offline";

	return (
		<span
			role="status"
			aria-label={label}
			title={label}
			style={{
				display: "inline-block",
				width: size,
				height: size,
				borderRadius: "50%",
				backgroundColor: color,
				flexShrink: 0,
			}}
		/>
	);
}
