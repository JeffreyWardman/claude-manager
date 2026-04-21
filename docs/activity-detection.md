# Activity Detection

How Claude Manager tracks whether a session is computing, waiting, or idle.

## Hook Events

Claude Code fires hooks at key lifecycle points. Claude Manager installs hooks into each
profile's `settings.json` to POST events to a local HTTP server (port 23816).

### Events we listen for

| Hook event | Tauri event | Purpose |
|---|---|---|
| `UserPromptSubmit` | `hook-computing-{id}` | User submitted a prompt — enter computing state |
| `Stop` | `hook-stop-{id}` | Claude finished responding — start drain timer |
| `PreToolUse` (Agent/Task) | `hook-agentlaunched-{id}` | Agent is about to be spawned |
| `SubagentStop` | `hook-agentdone-{id}` | A subagent completed |

### Events we don't use (but exist)

- `SubagentStart` — fires when agent spawns, but `PreToolUse` fires first and is sufficient
- `PostToolUse` — after any tool completes
- `SessionStart` / `SessionEnd` — session lifecycle
- `PreCompact` / `PostCompact` — context compaction

## How Claude Code handles subagents

All subagent hooks share the **same `session_id`** as the parent session. Each subagent
gets a unique `agent_id` in the hook payload but we don't use it — we only need to know
how many are running.

### Event sequence: user prompt → 2 agents → final response

```
1. UserPromptSubmit        ← enter computing
2. PreToolUse (Agent #1)   ← agentCount++
3. SubagentStart (#1)      (not used)
4. [Agent #1 runs tools]
5. SubagentStop (#1)       ← agentCount--
6. PreToolUse (Agent #2)   ← agentCount++
7. SubagentStart (#2)      (not used)
8. [Agent #2 runs tools]
9. SubagentStop (#2)       ← agentCount--
10. Stop                   ← agentCount=0, so → draining → 1.5s → waiting
```

### Event sequence: user prompt → 2 background agents → final response

When agents run with `run_in_background: true`, they may overlap:

```
1. UserPromptSubmit        ← enter computing
2. PreToolUse (Agent #1)   ← agentCount++
3. PreToolUse (Agent #2)   ← agentCount++
4. SubagentStop (#1)       ← agentCount-- (count=1, still >0)
5. SubagentStop (#2)       ← agentCount-- (count=0)
6. Stop                    ← agentCount=0, so → draining → 1.5s → waiting
```

Key: the `Stop` event fires only ONCE at the end of the entire turn, after all agents
complete. But intermediate PTY output and tool events continue while agents run.

## State Machine (XState)

Each session gets an independent XState actor (`usePtyActivity.ts`). Five states:

```
                          ┌──PTY_DATA (reenter, reset idle timer)
                          │
idle ──PROMPT──→ computing ──STOP(agents=0)──→ draining ──1.5s──→ waiting
                     │                                               │
                     ├──STOP(agents>0)──→ agentWait                  │
                     │                      │                        │
                     ├──60s idle──→ waiting  ├──PTY_DATA/STOP(reenter)│
                     │                      ├──AGENT_DONE & count=0  │
                     │                      │  → draining            │
                     │                      └──PROMPT → computing    │
                     │                                               │
waiting ──PROMPT──→ computing                                        │
    * ──EXIT──→ idle                                                 │
```

### State descriptions

| State | UI | Meaning |
|---|---|---|
| `idle` | No indicator | No PTY activity tracked |
| `computing` | Snake border | Claude is actively responding |
| `draining` | Snake border | Stop received, waiting for streaming to finish (1.5s) |
| `agentWait` | Snake border | Agents are running, waiting for all to complete |
| `waiting` | Green dot | Claude finished, awaiting user input |

### Key invariants

1. **`draining` ignores PTY_DATA.** After a non-agent Stop, streaming output must not
   re-enter computing. This was the root cause of "stuck as pending" — streaming output
   after Stop would re-enter computing, cancelling the transition timer indefinitely.

2. **`agentWait` tracks agent count.** `PreToolUse(Agent)` increments, `SubagentStop`
   decrements. Only when count reaches 0 does `AGENT_DONE` fire, transitioning to
   `draining`. This prevents premature "waiting" when one agent finishes but others
   are still running.

3. **`computing` reenter resets idle timer.** PTY output proves work is happening,
   so the 60s idle fallback restarts.

4. **`hadAgents` guard** on the `computing → agentWait` transition uses a boolean
   flag set by `PreToolUse(Agent)`. If Stop fires and no agents were launched,
   it goes straight to `draining` instead.

### UI mapping

The `toActivityState` function collapses internal states for the UI:
- `computing`, `draining`, `agentWait` → `"computing"` (snake border animation)
- `waiting` → `"waiting"` (green dot, unread blue dot if not focused)
- `idle` → `null` (no entry in activityMap)

## Unread Tracking

A session becomes "unread" when it transitions computing→waiting AND:
- It is not the currently selected session, OR
- The window is not focused

The window focus condition ensures the selected session still becomes unread when the
user Cmd+Tabs away. On focus regain, the selected session is immediately cleared from
unread.

## Dock Badge

The dock badge shows the unread session count:
- Uses macOS Cocoa API via `objc2` crate (`NSDockTile.setBadgeLabel`)
- Must run on main thread (`app.run_on_main_thread`)
- Window focus tracked via Tauri's `onFocusChanged`
- On focus regain: badge cleared AND selected session marked as read
- `unreadCountRef` (not state) used in focus handler to avoid re-renders

## Computing Border Animation

Uses a conic-gradient on a real `<div>` element (not `::before` pseudo-element).
The CSS mask-composite technique does NOT work in Tauri's WKWebView.

Instead:
- `.computing-border` div extends 4px outside the pane (`inset: -4px`, `border-radius: 10px`)
- Inner pane's solid background covers the center
- `@property --cm-angle` must use the `--cm-` prefix to avoid collision with
  Tailwind v4's `@property` fallback layer which resets `--border-angle`

## Hook Installation

`hook_server.rs:install_hooks()` runs at app startup. For each profile's config dir,
it merges hook entries into `settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "command", "command": "curl ..." }] }],
    "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "curl ..." }] }],
    "PreToolUse": [{ "matcher": "Agent", "hooks": [{ "type": "command", "command": "curl ..." }] }],
    "SubagentStop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "curl ..." }] }]
  }
}
```

The hook command differs by platform:
- **macOS/Linux**: `curl -sf --max-time 2 -X POST http://127.0.0.1:23816/hook -H 'Content-Type: application/json' -d @- || true`
- **Windows**: `powershell -NoProfile -Command "try { $input | Invoke-WebRequest ... } catch {}"`
