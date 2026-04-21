import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { createActor, createMachine } from "xstate";

export type ActivityState = "computing" | "waiting";

const STOP_CONFIRM_MS = 1_500;
const IDLE_FALLBACK_MS = 60_000;

// State machine for a single session's activity.
//
// idle       → computing     on PROMPT
// computing  → draining      on STOP (no running agents)
// computing  → agentWait     on STOP (agents still running)
// computing  → waiting       after 60s idle (no PTY output or hooks)
// draining   → waiting       after 1.5s
// agentWait  → draining      on AGENT_DONE (last agent completed)
// agentWait  → computing     on PTY_DATA (agents producing output)
// waiting    → computing     on PROMPT
// *          → idle          on EXIT
//
const sessionMachine = createMachine({
	id: "session",
	initial: "idle",
	states: {
		idle: {
			on: {
				PROMPT: "computing",
			},
		},
		computing: {
			after: {
				IDLE_TIMEOUT: "waiting",
			},
			on: {
				STOP: [{ guard: "hasRunningAgents", target: "agentWait" }, { target: "draining" }],
				PTY_DATA: { target: "computing", reenter: true },
				EXIT: "idle",
			},
		},
		draining: {
			after: {
				DRAIN_TIMEOUT: "waiting",
			},
			on: {
				PROMPT: "computing",
				EXIT: "idle",
			},
		},
		agentWait: {
			on: {
				AGENT_DONE: "draining",
				PTY_DATA: { target: "agentWait", reenter: true },
				STOP: { target: "agentWait", reenter: true },
				PROMPT: "computing",
				EXIT: "idle",
			},
		},
		waiting: {
			on: {
				PROMPT: "computing",
				EXIT: "idle",
			},
		},
	},
});

const delays = {
	IDLE_TIMEOUT: IDLE_FALLBACK_MS,
	DRAIN_TIMEOUT: STOP_CONFIRM_MS,
};

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
		const actors = new Map<string, ReturnType<typeof createActor>>();
		// Track running agent count per session.
		// Incremented on PreToolUse(Agent), decremented on SubagentStop.
		const agentCount = new Map<string, number>();

		function toActivityState(xstateValue: string): ActivityState | null {
			if (
				xstateValue === "computing" ||
				xstateValue === "draining" ||
				xstateValue === "agentWait"
			) {
				return "computing";
			}
			if (xstateValue === "waiting") {
				return "waiting";
			}
			return null;
		}

		for (const id of sessionIds) {
			const actor = createActor(
				sessionMachine.provide({
					delays,
					guards: {
						hasRunningAgents: () => (agentCount.get(id) ?? 0) > 0,
					},
				}),
			);

			actor.subscribe((snapshot) => {
				const activity = toActivityState(snapshot.value as string);
				setActivityMap((m) => {
					const prev = m.get(id);
					if (activity === null) {
						if (!m.has(id)) {
							return m;
						}
						const next = new Map(m);
						next.delete(id);
						return next;
					}
					if (prev === activity) {
						return m;
					}
					return new Map(m).set(id, activity);
				});
			});

			actor.start();
			actors.set(id, actor);

			// UserPromptSubmit: enter computing
			listen<void>(`hook-computing-${id}`, () => {
				actor.send({ type: "PROMPT" });
				onInputRef.current?.(id);
			}).then((fn) => unlisteners.push(fn));

			// PreToolUse(Agent/Task): an agent is about to be spawned
			listen<void>(`hook-agentlaunched-${id}`, () => {
				agentCount.set(id, (agentCount.get(id) ?? 0) + 1);
			}).then((fn) => unlisteners.push(fn));

			// SubagentStop: an agent completed
			listen<void>(`hook-agentdone-${id}`, () => {
				const count = Math.max(0, (agentCount.get(id) ?? 0) - 1);
				agentCount.set(id, count);
				if (count === 0) {
					actor.send({ type: "AGENT_DONE" });
				}
			}).then((fn) => unlisteners.push(fn));

			// Stop: Claude finished responding
			listen<void>(`hook-stop-${id}`, () => {
				actor.send({ type: "STOP" });
			}).then((fn) => unlisteners.push(fn));

			// PTY output: mark session as alive
			listen<string>(`pty-data-${id}`, () => {
				setAlivePtys((s) => {
					if (s.has(id)) {
						return s;
					}
					return new Set(s).add(id);
				});
				actor.send({ type: "PTY_DATA" });
			}).then((fn) => unlisteners.push(fn));

			// PTY exit: session terminated
			listen<void>(`pty-exit-${id}`, () => {
				agentCount.delete(id);
				actor.send({ type: "EXIT" });
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
			for (const actor of actors.values()) actor.stop();
		};
	}, [idsKey]);

	return { activityMap, alivePtys };
}
