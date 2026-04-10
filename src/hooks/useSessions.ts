import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import type { ClaudeSession } from "../types";

const POLL_INTERVAL = 3000;

export function useSessions() {
	const [sessions, setSessions] = useState<ClaudeSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await invoke<ClaudeSession[]>("get_sessions");
			setSessions(result);
			setError(null);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
		const interval = setInterval(refresh, POLL_INTERVAL);
		const unlistenPromise = listen("sessions-changed", () => {
			refresh();
		});
		return () => {
			clearInterval(interval);
			unlistenPromise.then((fn) => fn());
		};
	}, [refresh]);

	return { sessions, loading, error, refresh };
}
