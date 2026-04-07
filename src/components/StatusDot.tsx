import type { SessionStatus } from "../types";
import type { ActivityState } from "../hooks/usePtyActivity";

interface Props {
  status: SessionStatus;
  activity?: ActivityState;
  size?: number;
}

export function StatusDot({ status, activity, size = 8 }: Props) {
  if (activity === "computing") {
    return (
      <span
        className="pty-computing"
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

  if (activity === "waiting") {
    return (
      <span
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

  const color = status === "active" ? "#4ade8066" : "#374151";
  const title = status === "active" ? "Active" : "Offline";

  return (
    <span
      title={title}
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
