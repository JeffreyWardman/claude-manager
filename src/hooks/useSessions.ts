import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import type { ClaudeSession } from "../types";

const POLL_INTERVAL = 3000;

export function useSessions(configDir: string) {
	const [sessions, setSessions] = useState<ClaudeSession[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const result = await invoke<ClaudeSession[]>("get_sessions", { configDir });
			setSessions(result);
		} catch {
		} finally {
			setLoading(false);
		}
	}, [configDir]);

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

	return { sessions, loading, refresh };
}
