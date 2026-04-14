import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export type ActivityState = "computing" | "waiting";

// How long after a Stop hook fires (no agents launched since last Stop) before
// we consider Claude truly done.
const STOP_CONFIRM_MS = 1_000;

// How long after a Stop hook fires when agents were launched since the last Stop.
// Agents run asynchronously; their PTY output will cancel this timer. A subsequent
// Stop (after agents finish and Claude resumes) uses the short window instead.
const AGENT_STOP_CONFIRM_MS = 5 * 60 * 1000;

// Fallback: if no Stop hook ever arrives (e.g. hooks not yet installed for a
// running session), transition to waiting after this long without PTY output.
const IDLE_FALLBACK_MS = 60_000;

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: idsKey is intentionally the only dep to avoid re-subscribing on every render
	useEffect(() => {
		if (sessionIds.length === 0) {
			return;
		}

		const unlisteners: (() => void)[] = [];
		// hasInput: set when user submits a prompt, cleared only on pty-exit.
		// Keeps the session "active" so pty-data can resume computing even after
		// an intermediate stop.
		const hasInput = new Set<string>();
		// hadAgentLaunch: set when the Agent PreToolUse hook fires, which happens
		// before the background agent is launched and before the intermediate Stop.
		// When Stop fires with this flag set, we use the extended confirmation window
		// instead of the short one. Cleared on each Stop so the *next* Stop (after
		// all agents complete and Claude resumes) uses the normal short window.
		const hadAgentLaunch = new Set<string>();
		// stopTimerIsAgentMode: tracks whether the current stop confirm timer for
		// a session is the long agent-mode timer. PTY output cancels the long timer
		// (agents still running) but must NOT cancel the short final-stop timer
		// (we want it to fire so the session leaves computing state).
		const stopTimerIsAgentMode = new Set<string>();
		const stopConfirmTimers = new Map<string, ReturnType<typeof setTimeout>>();
		const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

		function clearTimers(id: string) {
			const st = stopConfirmTimers.get(id);
			if (st) {
				clearTimeout(st);
				stopConfirmTimers.delete(id);
			}
			stopTimerIsAgentMode.delete(id);
			const it = idleTimers.get(id);
			if (it) {
				clearTimeout(it);
				idleTimers.delete(id);
			}
		}

		function scheduleIdleFallback(id: string) {
			const prev = idleTimers.get(id);
			if (prev) {
				clearTimeout(prev);
			}
			idleTimers.set(
				id,
				setTimeout(() => {
					idleTimers.delete(id);
					setActivityMap((m) => new Map(m).set(id, "waiting"));
				}, IDLE_FALLBACK_MS),
			);
		}

		for (const id of sessionIds) {
			// UserPromptSubmit hook: the only entry point into computing state.
			listen<void>(`hook-computing-${id}`, () => {
				hasInput.add(id);
				clearTimers(id);
				setActivityMap((m) => new Map(m).set(id, "computing"));
				scheduleIdleFallback(id);
				onInputRef.current?.(id);
			}).then((fn) => unlisteners.push(fn));

			// Agent PreToolUse: fires just before a background agent is launched,
			// which is before the intermediate Stop for that agent batch.
			listen<void>(`hook-agentlaunched-${id}`, () => {
				hadAgentLaunch.add(id);
			}).then((fn) => unlisteners.push(fn));

			// Stop hook: if agents were launched since the last Stop, use the
			// extended window — their PTY output will cancel the timer when they
			// complete. Otherwise use the short window. The flag is cleared on each
			// Stop so the next Stop (after Claude resumes from agents) is fast.
			listen<void>(`hook-stop-${id}`, () => {
				if (!hasInput.has(id)) {
					return;
				}
				const hadAgent = hadAgentLaunch.has(id);
				hadAgentLaunch.delete(id);
				if (hadAgent) {
					stopTimerIsAgentMode.add(id);
				} else {
					stopTimerIsAgentMode.delete(id);
				}
				const delay = hadAgent ? AGENT_STOP_CONFIRM_MS : STOP_CONFIRM_MS;
				const prev = stopConfirmTimers.get(id);
				if (prev) {
					clearTimeout(prev);
				}
				stopConfirmTimers.set(
					id,
					setTimeout(() => {
						stopConfirmTimers.delete(id);
						stopTimerIsAgentMode.delete(id);
						clearTimers(id);
						setActivityMap((m) => new Map(m).set(id, "waiting"));
					}, delay),
				);
			}).then((fn) => unlisteners.push(fn));

			// PTY output: work is still in progress. Cancel the stop timer only if
			// it's the long agent-mode one — agents are still running and PTY output
			// proves it. Do NOT cancel the short final-stop timer; let it fire so
			// the session exits computing state after the last response.
			listen<string>(`pty-data-${id}`, () => {
				if (!hasInput.has(id)) {
					return;
				}
				if (stopTimerIsAgentMode.has(id)) {
					const st = stopConfirmTimers.get(id);
					if (st) {
						clearTimeout(st);
						stopConfirmTimers.delete(id);
						stopTimerIsAgentMode.delete(id);
					}
				}
				// Resume computing if an intermediate stop incorrectly set us to waiting.
				setActivityMap((m) => {
					if (m.get(id) !== "computing") {
						return new Map(m).set(id, "computing");
					}
					return m;
				});
				scheduleIdleFallback(id);
			}).then((fn) => unlisteners.push(fn));

			listen<void>(`pty-exit-${id}`, () => {
				hasInput.delete(id);
				hadAgentLaunch.delete(id);
				stopTimerIsAgentMode.delete(id);
				clearTimers(id);
				setActivityMap((m) => {
					const next = new Map(m);
					next.delete(id);
					return next;
				});
				onExitRef.current?.(id);
			}).then((fn) => unlisteners.push(fn));
		}

		return () => {
			for (const fn of unlisteners) fn();
			for (const t of stopConfirmTimers.values()) clearTimeout(t);
			for (const t of idleTimers.values()) clearTimeout(t);
			stopTimerIsAgentMode.clear();
		};
	}, [idsKey]);

	return activityMap;
}
