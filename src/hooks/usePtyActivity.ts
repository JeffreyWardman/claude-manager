import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export type ActivityState = "computing" | "waiting";

const IDLE_AFTER_MS = 1500;

export function usePtyActivity(sessionIds: string[]): Map<string, ActivityState> {
  const [activityMap, setActivityMap] = useState<Map<string, ActivityState>>(new Map());
  const idsKey = sessionIds.slice().sort().join(",");

  useEffect(() => {
    if (sessionIds.length === 0) return;

    const unlisteners: (() => void)[] = [];
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    // Track which sessions have had user input (to gate on startup output)
    const hasInput = new Set<string>();

    function scheduleIdle(id: string) {
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      timers.set(id, setTimeout(() => {
        setActivityMap((m) => new Map(m).set(id, "waiting"));
      }, IDLE_AFTER_MS));
    }

    for (const id of sessionIds) {
      // User sent input → start computing
      listen<void>(`pty-input-${id}`, () => {
        hasInput.add(id);
        setActivityMap((m) => new Map(m).set(id, "computing"));
        scheduleIdle(id);
      }).then((fn) => unlisteners.push(fn));

      // PTY output → only extend timer if we're already in computing state
      listen<string>(`pty-data-${id}`, () => {
        if (hasInput.has(id)) {
          scheduleIdle(id);
        }
      }).then((fn) => unlisteners.push(fn));
    }

    return () => {
      unlisteners.forEach((fn) => fn());
      timers.forEach((t) => clearTimeout(t));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return activityMap;
}
