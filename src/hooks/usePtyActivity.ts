import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export type ActivityState = "computing" | "waiting";

const IDLE_AFTER_MS = 1500;

export function usePtyActivity(
  sessionIds: string[],
  onInput?: (sessionId: string) => void,
  onExit?: (sessionId: string) => void,
): Map<string, ActivityState> {
  const [activityMap, setActivityMap] = useState<Map<string, ActivityState>>(new Map());
  const idsKey = sessionIds.slice().sort().join(",");
  const onInputRef = { current: onInput };
  onInputRef.current = onInput;
  const onExitRef = { current: onExit };
  onExitRef.current = onExit;

  useEffect(() => {
    if (sessionIds.length === 0) return;

    const unlisteners: (() => void)[] = [];
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const hasInput = new Set<string>();

    function scheduleIdle(id: string) {
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      timers.set(id, setTimeout(() => {
        hasInput.delete(id);
        setActivityMap((m) => new Map(m).set(id, "waiting"));
      }, IDLE_AFTER_MS));
    }

    for (const id of sessionIds) {
      listen<void>(`pty-input-${id}`, () => {
        hasInput.add(id);
        setActivityMap((m) => new Map(m).set(id, "computing"));
        scheduleIdle(id);
        onInputRef.current?.(id);
      }).then((fn) => unlisteners.push(fn));

      listen<string>(`pty-data-${id}`, () => {
        if (hasInput.has(id)) {
          scheduleIdle(id);
        }
      }).then((fn) => unlisteners.push(fn));

      listen<void>(`pty-exit-${id}`, () => {
        hasInput.delete(id);
        const prev = timers.get(id);
        if (prev) clearTimeout(prev);
        setActivityMap((m) => { const next = new Map(m); next.delete(id); return next; });
        onExitRef.current?.(id);
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
