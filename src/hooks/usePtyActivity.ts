import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

export type ActivityState = "computing" | "waiting";

// How long after a non-agent Stop hook fires before transitioning to waiting.
const STOP_CONFIRM_MS = 1_500;

// How long after an agent-mode Stop hook fires. Agents run asynchronously;
// their PTY output will cancel this timer. A subsequent Stop (after agents
// finish and Claude resumes) uses the short window instead.
const AGENT_STOP_CONFIRM_MS = 5 * 60 * 1000;

// Fallback: if no Stop hook ever arrives (e.g. hooks not yet installed for a
// running session), transition to waiting after this long without PTY output.
const IDLE_FALLBACK_MS = 60_000;

export function usePtyActivity(
	sessionIds: string[],
	onInput?: (sessionId: string) => void,
	onExit?: (sessionId: string) => void,
): { activityMap: Map<string, ActivityState>; alivePtys: Set<string> } {
	const [activityMap, setActivityMap] = useState<Map<string, ActivityState>>(new Map());
	const [alivePtys, setAlivePtys] = useState<Set<string>>(new Set());
	const idsKey = sessionIds.slice().sort().join(",");
	const onInputRef = useRef(onInput);
	onInputRef.current = onInput;
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	// biome-ignore lint/correctness/useExhaustiveDependencies: idsKey is intentionally the only dep to avoid re-subscribing on every render
	useEffect(() => {
		if (sessionIds.length === 0) {
			return;
		}

		const unlisteners: (() => void)[] = [];
		// isComputing: true while Claude is actively responding.
		const isComputing = new Set<string>();
		// finalStopReceived: set when a non-agent Stop fires. While true, PTY data
		// will NOT re-enter computing — output is just the tail end streaming.
		const finalStopReceived = new Set<string>();
		// hadAgentLaunch: set when Agent PreToolUse fires. Cleared on each Stop so
		// the next Stop (after agents complete) uses the short window.
		const hadAgentLaunch = new Set<string>();
		// agentStopActive: the current stop timer is the long agent-mode one.
		// PTY output cancels agent-mode timers (agents still running) but does NOT
		// cancel final-stop timers.
		const agentStopActive = new Set<string>();
		const stopConfirmTimers = new Map<string, ReturnType<typeof setTimeout>>();
		const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

		function clearTimers(id: string) {
			const st = stopConfirmTimers.get(id);
			if (st) {
				clearTimeout(st);
				stopConfirmTimers.delete(id);
			}
			agentStopActive.delete(id);
			const it = idleTimers.get(id);
			if (it) {
				clearTimeout(it);
				idleTimers.delete(id);
			}
		}

		function transitionToWaiting(id: string) {
			isComputing.delete(id);
			finalStopReceived.delete(id);
			agentStopActive.delete(id);
			hadAgentLaunch.delete(id);
			clearTimers(id);
			setActivityMap((m) => new Map(m).set(id, "waiting"));
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
					transitionToWaiting(id);
				}, IDLE_FALLBACK_MS),
			);
		}

		for (const id of sessionIds) {
			// UserPromptSubmit: enter computing state.
			listen<void>(`hook-computing-${id}`, () => {
				isComputing.add(id);
				finalStopReceived.delete(id);
				hadAgentLaunch.delete(id);
				agentStopActive.delete(id);
				clearTimers(id);
				setActivityMap((m) => new Map(m).set(id, "computing"));
				scheduleIdleFallback(id);
				onInputRef.current?.(id);
			}).then((fn) => unlisteners.push(fn));

			// Agent PreToolUse: fires before a background agent is launched.
			listen<void>(`hook-agentlaunched-${id}`, () => {
				hadAgentLaunch.add(id);
			}).then((fn) => unlisteners.push(fn));

			// Stop: Claude finished a response. If agents were launched since the
			// last Stop, use the extended window (agents still running). Otherwise
			// use the short window and mark as final stop so pty-data won't re-enter.
			listen<void>(`hook-stop-${id}`, () => {
				if (!isComputing.has(id)) {
					return;
				}
				const isAgentStop = hadAgentLaunch.has(id);
				hadAgentLaunch.delete(id);

				if (isAgentStop) {
					agentStopActive.add(id);
					finalStopReceived.delete(id);
				} else {
					agentStopActive.delete(id);
					finalStopReceived.add(id);
				}

				const delay = isAgentStop ? AGENT_STOP_CONFIRM_MS : STOP_CONFIRM_MS;
				const prev = stopConfirmTimers.get(id);
				if (prev) {
					clearTimeout(prev);
				}
				stopConfirmTimers.set(
					id,
					setTimeout(() => {
						stopConfirmTimers.delete(id);
						transitionToWaiting(id);
					}, delay),
				);
			}).then((fn) => unlisteners.push(fn));

			// PTY output: mark session as alive.
			// - If final (non-agent) Stop was received: don't re-enter computing,
			//   output is just the tail end streaming.
			// - If agent-mode Stop is active: cancel the timer (agents still running),
			//   re-enter computing.
			// - Otherwise: re-enter computing if not already.
			listen<string>(`pty-data-${id}`, () => {
				setAlivePtys((s) => {
					if (s.has(id)) {
						return s;
					}
					return new Set(s).add(id);
				});
				if (!isComputing.has(id)) {
					return;
				}
				// Final stop received: don't fight the timer, let it transition.
				if (finalStopReceived.has(id)) {
					return;
				}
				// Agent-mode stop: cancel timer, agents are still producing output.
				if (agentStopActive.has(id)) {
					const st = stopConfirmTimers.get(id);
					if (st) {
						clearTimeout(st);
						stopConfirmTimers.delete(id);
						agentStopActive.delete(id);
					}
				}
				// Re-enter computing if we were knocked out by an intermediate stop.
				setActivityMap((m) => {
					if (m.get(id) !== "computing") {
						return new Map(m).set(id, "computing");
					}
					return m;
				});
				scheduleIdleFallback(id);
			}).then((fn) => unlisteners.push(fn));

			listen<void>(`pty-exit-${id}`, () => {
				isComputing.delete(id);
				finalStopReceived.delete(id);
				hadAgentLaunch.delete(id);
				agentStopActive.delete(id);
				clearTimers(id);
				setActivityMap((m) => {
					const next = new Map(m);
					next.delete(id);
					return next;
				});
				setAlivePtys((s) => {
					if (!s.has(id)) {
						return s;
					}
					const next = new Set(s);
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
		};
	}, [idsKey]);

	return { activityMap, alivePtys };
}
