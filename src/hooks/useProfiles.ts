import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../types";

export function useProfiles() {
	const [profiles, setProfiles] = useState<Profile[]>([]);

	const refresh = useCallback(async () => {
		try {
			const result = await invoke<Profile[]>("discover_profiles");
			setProfiles(result);
		} catch (e) {
			console.error("Failed to discover profiles:", e);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const visibleProfiles = profiles.filter((p) => !p.hidden);

	const saveProfiles = useCallback(async (updated: Profile[]) => {
		setProfiles(updated);
		await invoke("save_profile_config", { profiles: updated });
	}, []);

	return { profiles, visibleProfiles, refresh, saveProfiles };
}
