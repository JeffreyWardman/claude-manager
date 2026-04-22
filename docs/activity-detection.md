# Activity Detection

How Claude Manager tracks session lifecycle, activity state, and notifications.

## New Session Creation Lifecycle

Creating a new session involves a multi-step handoff between frontend and backend.

### Step-by-step flow

1. **User clicks "New Session"** — `handleNewSession(cwd)` in `App.tsx`:
   - Generates a temporary ID: `new-{timestamp}`
   - Records `pendingPty = { tmpId, cwd, existingIds }` — snapshots all current session IDs
   - Sets `standaloneSelectedId` to the temp ID
   - Calls `pty_spawn` with `resume: false` (no `--resume` flag)

2. **`pty_spawn` in Rust** (`pty_manager.rs`):
   - Validates the ID (alphanumeric + hyphens only)
   - Acquires a lockfile at `~/.claude/manager/locks/{id}.lock`
   - Opens a PTY via `portable-pty`, spawns `$SHELL -l -c "claude"` with the given cwd
   - Spawns a reader thread that:
     - On first output, emits `sessions-changed` at 1s and 3s delays (gives Claude time
       to write its pid file)
     - Continuously reads PTY output, appends to a 512KB scrollback buffer
     - Emits `pty-data-{id}` (base64-encoded) for each chunk
     - On EOF/error, emits `pty-exit-{id}`, removes the PTY entry (if it still belongs
       to this spawn instance), releases the lockfile, and emits `sessions-changed`

3. **`TerminalPane` mounts** with `ptyId = "new-{timestamp}"`:
   - Creates an xterm.js terminal
   - Calls `pty_get_scrollback` — finds the entry (just spawned), replays any buffered output
   - Subscribes to `pty-data-{ptyId}` for live output
   - Pipes user input to `pty_write`

4. **Claude Code creates its JSONL file** — happens after Claude initializes (~1-3s):
   - Claude writes `~/.claude/sessions/{pid}.json` (pid file)
   - Claude writes `~/.claude/projects/{project}/{uuid}.jsonl` (conversation file)

5. **Backend discovers the new session** (`sessions.rs:get_all_sessions`):
   - `useSessions` polls every 3s, plus reacts to `sessions-changed` events
   - The rekey effect in `App.tsx` polls aggressively at 200ms while `pendingPty` exists
   - Matches the new session by finding one whose `session_id` is NOT in `existingIds`
     AND whose cwd basename matches `pendingPty.cwd`

6. **`pty_rekey`** (`pty_manager.rs`):
   - Removes the PTY entry keyed by `new-{timestamp}`
   - Updates the `event_id` Arc to the real session UUID — the reader thread immediately
     starts emitting events under the new ID
   - Re-inserts the entry keyed by the real UUID
   - Transfers the lockfile from temp ID to real ID

7. **Frontend state update** (after rekey resolves):
   - `standaloneSelectedId` switches to the real UUID
   - `pendingPty` is cleared
   - `TerminalPane` unmounts (keyed on old ptyId) and remounts with the real ID
   - On remount, `pty_get_scrollback` replays the full scrollback — no output is lost

### Why pty_rekey exists

When the user creates a new session, Claude Code hasn't started yet — there is no session
UUID. The PTY must be spawned immediately (the user sees the terminal), but the PTY map
and event system need a key. We use a temporary `new-{timestamp}` key, then atomically
rekey to the real UUID once discovered. The `event_id` Arc inside the reader thread means
the thread never needs to be restarted — it just starts emitting under the new name.

### The scrollback identity check

When the reader thread exits, it must remove the PTY entry from the map. But if `pty_spawn`
was called again for the same ID before the old reader exits, the new entry would have a
different `scrollback` Arc. The reader uses `Arc::ptr_eq` to verify it's removing its own
entry, not the replacement.

## Session Discovery (`sessions.rs`)

`get_all_sessions(config_dir)` builds the session list in three steps:

1. **Scan pid files** (`~/.claude/sessions/*.json`): Find alive processes, build a
   `cwd -> pid` map. Also collect sessions that have a pid file but no JSONL yet
   (freshly spawned).

2. **Scan JSONL files** (`~/.claude/projects/*/*.jsonl`): Read the first valid line
   for `sessionId`, `cwd`, `timestamp`, `gitBranch`. This is the primary source —
   sessions only appear in the UI once they have a JSONL file. Pid-only sessions
   (alive process, no JSONL) are added as a fallback for freshly spawned sessions.

3. **Merge and sort**: For each cwd with a live process, the most recent JSONL session
   in that directory is marked Active. Offline sessions are capped at 50. Final sort:
   active first, then offline, newest first within each group.

### liveSessions (`App.tsx`)

The frontend's `liveSessions` memo overrides session status based on local PTY state:
if a session has PTY activity (`activityMap` or `alivePtys`) but the backend says "offline",
it's promoted to "active". This handles the window between PTY spawn and the next session
poll. Ignored sessions (per user's ignore patterns) are filtered out here.

## Polling and Events (`useSessions.ts`)

Sessions are refreshed via three mechanisms:
- **3-second poll interval** — catches changes from external processes
- **`sessions-changed` event** — emitted by PTY reader on first output (1s/3s delays)
  and on PTY exit
- **200ms aggressive poll** — only while `pendingPty` is active (the rekey effect)

## Activity State Machine (XState)

Each session gets an independent XState actor (`usePtyActivity.ts`). Five states:

```
                          +--PTY_DATA (reenter, reset idle timer)
                          |
idle --PROMPT--> computing --STOP(agents=0)--> draining --1.5s--> waiting
                     |                                               |
                     +--STOP(agents>0)--> agentWait                  |
                     |                      |                        |
                     +--60s idle--> waiting  +--PTY_DATA/STOP(reenter)|
                     |                      +--AGENT_DONE & count=0  |
                     |                      |  --> draining           |
                     |                      +--PROMPT --> computing   |
                     |                                               |
waiting --PROMPT--> computing                                        |
    * --EXIT--> idle                                                 |
```

### State descriptions

| State | UI | Meaning |
|---|---|---|
| `idle` | No indicator | No PTY activity tracked |
| `computing` | Snake border | Claude is actively responding |
| `draining` | Snake border | Stop received, waiting for streaming to finish (1.5s) |
| `agentWait` | Snake border | Agents are running, waiting for all to complete |
| `waiting` | Green dot | Claude finished, awaiting user input |

### Transitions

| From | Event | Guard | To |
|---|---|---|---|
| idle | PROMPT | | computing |
| computing | STOP | hasRunningAgents | agentWait |
| computing | STOP | !hasRunningAgents | draining |
| computing | PTY_DATA | | computing (reenter) |
| computing | EXIT | | idle |
| computing | (60s timeout) | | waiting |
| draining | PROMPT | | computing |
| draining | EXIT | | idle |
| draining | (1.5s timeout) | | waiting |
| agentWait | AGENT_DONE | | draining |
| agentWait | PTY_DATA | | agentWait (reenter) |
| agentWait | STOP | | agentWait (reenter) |
| agentWait | PROMPT | | computing |
| agentWait | EXIT | | idle |
| waiting | PROMPT | | computing |
| waiting | EXIT | | idle |

### Key invariants

1. **`draining` ignores PTY_DATA.** After a non-agent Stop, streaming output must not
   re-enter computing. This was the root cause of "stuck computing" — streaming output
   after Stop would re-enter computing, cancelling the drain timer indefinitely.

2. **`agentWait` tracks agent count.** `PreToolUse(Agent/Task)` increments a counter,
   `SubagentStop` decrements. Only when count reaches 0 does `AGENT_DONE` fire,
   transitioning to `draining`. Prevents premature "waiting" when one agent finishes
   but others are still running.

3. **`computing` reenter resets idle timer.** PTY output proves work is happening,
   so the 60s idle fallback restarts on every chunk.

4. **`hasRunningAgents` guard** on the `computing -> agentWait` transition checks
   `agentCount.get(id) > 0`. The count lives in a mutable Map outside the machine,
   not in machine context.

5. **`agentWait` PTY_DATA and STOP reenter** — these are no-ops that keep the state
   alive. Without reenter, the events would be silently dropped (correct behavior),
   but reenter is explicit about the intent.

6. **Agent count is cleared on EXIT.** When the PTY exits, `agentCount.delete(id)`
   prevents stale counts from affecting a future session with the same ID.

### UI mapping

The `toActivityState` function collapses internal states for the UI:
- `computing`, `draining`, `agentWait` -> `"computing"` (snake border animation)
- `waiting` -> `"waiting"` (green dot, unread blue dot if not focused)
- `idle` -> `null` (no entry in activityMap)

## Hook Events

Claude Code fires hooks at key lifecycle points. Claude Manager installs hooks into each
profile's `settings.json` to POST events to a local HTTP server (port 23816).

### Events we listen for

| Hook event | Tauri event | Purpose |
|---|---|---|
| `UserPromptSubmit` | `hook-computing-{id}` | User submitted a prompt -> enter computing |
| `Stop` | `hook-stop-{id}` | Claude finished responding -> start drain timer |
| `PreToolUse` (Agent/Task) | `hook-agentlaunched-{id}` | Agent is about to be spawned |
| `SubagentStop` | `hook-agentdone-{id}` | A subagent completed |

### Events we don't use (but exist)

- `SubagentStart` — fires when agent spawns, but `PreToolUse` fires first and is sufficient
- `PostToolUse` — after any tool completes
- `SessionStart` / `SessionEnd` — session lifecycle
- `PreCompact` / `PostCompact` — context compaction

### How Claude Code handles subagents

All subagent hooks share the **same `session_id`** as the parent session. Each subagent
gets a unique `agent_id` in the hook payload but we don't use it — we only need to know
how many are running.

### Event sequence: user prompt -> 2 sequential agents -> final response

```
1. UserPromptSubmit        <- enter computing
2. PreToolUse (Agent #1)   <- agentCount++
3. SubagentStart (#1)      (not used)
4. [Agent #1 runs tools]
5. SubagentStop (#1)       <- agentCount--
6. PreToolUse (Agent #2)   <- agentCount++
7. SubagentStart (#2)      (not used)
8. [Agent #2 runs tools]
9. SubagentStop (#2)       <- agentCount--
10. Stop                   <- agentCount=0, so -> draining -> 1.5s -> waiting
```

### Event sequence: user prompt -> 2 background agents -> final response

When agents run with `run_in_background: true`, they may overlap:

```
1. UserPromptSubmit        <- enter computing
2. PreToolUse (Agent #1)   <- agentCount++
3. PreToolUse (Agent #2)   <- agentCount++
4. SubagentStop (#1)       <- agentCount-- (count=1, still >0)
5. SubagentStop (#2)       <- agentCount-- (count=0)
6. Stop                    <- agentCount=0, so -> draining -> 1.5s -> waiting
```

Key: the `Stop` event fires only ONCE at the end of the entire turn, after all agents
complete. But intermediate PTY output and tool events continue while agents run.

## Hook Installation

`hook_server.rs:install_hooks()` runs at app startup. For each profile's config dir,
it merges hook entries into `settings.json`. It checks for existing entries that already
contain the hook URL to avoid duplicates. The hook command differs by platform:
- **macOS/Linux**: `curl -sf --max-time 2 -X POST http://127.0.0.1:23816/hook -H 'Content-Type: application/json' -d @- || true`
- **Windows**: `powershell -NoProfile -Command "try { $input | Invoke-WebRequest ... } catch {}"`

The server validates that connections come from localhost only (loopback check on peer
address) and validates session IDs before emitting events.

## Unread Tracking

A session becomes "unread" (`App.tsx`) when it transitions computing->waiting AND:
- It is not the currently selected session, OR
- The window is not focused (`windowFocusedRef.current === false`)

The window focus condition is critical — without it, the focused session never becomes
unread when the user Cmd+Tabs away, so the dock badge never shows.

Unread is cleared when:
- The session is selected (`selectedId` effect)
- The user types in the session's PTY (`onInput` callback from `usePtyActivity`)
- The window regains focus and the session is currently selected

## Dock Badge

The dock badge shows the unread session count:
- Uses macOS Cocoa API via `objc2` crate (`NSDockTile.setBadgeLabel`)
- Must run on main thread (`app.run_on_main_thread`)
- Window focus tracked via Tauri's `onFocusChanged` (not DOM focus/blur — those
  fire on webview-internal focus changes, causing visual glitches)
- Badge is set when `unreadSessions` changes and window is not focused
- On focus regain: badge cleared AND selected session marked as read
- `unreadCountRef` (not state) used in focus handler to avoid re-renders

### Notification sound

When a session transitions computing->waiting and would be marked unread, a notification
sound is played if enabled via `notif-sound-enabled` and `notif-sound-path` localStorage
settings. Uses the Tauri `play_sound` command (which invokes `afplay` on macOS).

## Computing Border Animation

Uses a conic-gradient on a real `<div>` element (not `::before` pseudo-element).
The CSS mask-composite technique does NOT work in Tauri's WKWebView.

Instead:
- `.computing-border` div extends 4px outside the pane (`inset: -4px`, `border-radius: 10px`)
- Inner pane's solid background covers the center
- `@property --cm-angle` must use the `--cm-` prefix to avoid collision with
  Tailwind v4's `@property` fallback layer which resets `--border-angle`

## Cleanup Effect (Group Slot Eviction)

The cleanup effect in `App.tsx` (line ~221) removes stale session IDs from group slots:
- Triggers on session list changes (not group changes)
- Builds a set of valid IDs: all discovered sessions + pending PTY temp ID
- Nulls out any group slot whose session ID is not in the valid set
- Groups with all-null slots after cleanup are NOT pruned here (only `dropToSlot`,
  `removeFromGroup`, and `removeFromSlot` prune empty groups)

This protects against: archived sessions lingering in groups, deleted sessions leaving
ghost slots, sessions that disappear from discovery.

## Pending Rename Flush

When a session transitions to "waiting" (computing->waiting or any->waiting), if it has
a `pending_rename` in metadata and has a live PTY, the app writes `/rename {name}\r` to
the PTY and clears the pending rename. This allows rename-on-next-idle behavior.

## Known Edge Cases

1. **Rekey race**: If the user creates two sessions in the same cwd rapidly, the rekey
   match (by cwd basename) could match the wrong session. Mitigated by the `existingIds`
   snapshot — only sessions not in the snapshot are candidates.

2. **Port conflict**: If port 23816 is already bound, the hook server silently no-ops.
   Activity detection falls back to the 60s idle timer (no hook events).

3. **Multiple windows**: Each window runs its own hook server attempt. Only one binds
   the port. Lock files prevent two windows from resuming the same session, but hook
   events are broadcast to whichever window's server is running.

4. **PTY exit during rekey**: If the PTY exits between spawn and rekey, `handlePtyExit`
   clears `pendingPty` if it matches the temp ID, preventing a stuck pending state.

5. **Scrollback overflow**: The 512KB scrollback buffer is a ring — excess bytes are
   drained from the front. Long-running sessions lose early output.
