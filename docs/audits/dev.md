# Code Audit Report

**Last audit:** 2026-04-22 (round 10-11, converged, dual-reviewer process)
**Standard:** DRY, SOLID, clean code, correctness, safety
**Status: PASS** -- all confirmed issues resolved

---

## Test coverage

111 tests, 3 test files. Pure logic modules are unit tested. React components and Tauri IPC are integration-heavy (tested manually).

| File | Stmts | Branch | Funcs | Lines | Uncovered |
|------|-------|--------|-------|-------|-----------|
| **All files** | **98.9%** | **92.0%** | **100%** | **98.8%** | |
| groupOps.ts | 100% | 97.4% | 100% | 100% | branch:170 |
| sidebarUtils.ts | 98.0% | 89.7% | 100% | 97.9% | 192, 214 |

Uncovered lines 192 and 214 in `sidebarUtils.ts` are dead branches — bare-path tilde expansion that can never produce a match that the raw-cwd substring check on the preceding line doesn't already catch. Removing them would be correct but they serve as defensive guards.

---

## Audit process

Two independent reviewers audit in parallel, then findings are collated:

- **Auditor A** (correctness & safety): logic bugs, race conditions, injection, resource leaks, type safety, edge cases
- **Auditor B** (architecture & design): DRY violations, SOLID principles, dead code, consistency, maintainability

Findings are cross-referenced. Both-flagged items are high confidence. Single-flagged items are verified against actual code and tests before acting. False positives are discarded with reasoning.

---

## Audit log

### 2026-04-14 — Round 9 (dual-reviewer) — ZERO CONFIRMED ISSUES

**Linting:** `cargo fmt` clean, `clippy` 1 accepted warning, `biome` 0 errors / 49 warnings, 111/111 tests, 100% statement coverage / 91.81% branch.

No fixes applied.

#### Discarded (false positives)

| Finding | Flagged by | Reason discarded |
|---------|-----------|------------------|
| useFocusTrap missing `onEscape` dep | A | `onEscape` IS in the dep array at line 32 — 4th time flagged |
| sidebarUtils.ts:171 platform path handling | A, B | `cwd` is lowercased on line 170 before the regex; macOS-primary pattern accepted |
| App.tsx:141 splice without bounds check | A | `real` is from `discovered.find()`, array not mutated between — 4th time flagged |
| sidebarUtils.ts:138 RegExp from user input | A | `globToRegex` escapes all metacharacters before building the pattern; no raw input |
| App.tsx `selectSession` stale `configDir` | B | `groups` is in deps; profile-switch effect resets `groups` in same batch, callback recreated before user interaction |
| `handleCreateGroupWithSession` duplication | B | Different logic: one removes session from other groups first; the other slots two IDs side-by-side |

---

### 2026-04-14 — Round 8 (dual-reviewer)

**Linting:** `cargo fmt` clean, `clippy` 1 accepted warning, `biome` 0 errors / 49 warnings, 111/111 tests, 100% statement coverage / 91.81% branch.

#### Confirmed and fixed

| Severity | Finding | Flagged by | File | Fix |
|----------|---------|-----------|------|-----|
| LOW | `to_str().unwrap_or("~")` silently leaves `~` unexpanded when home dir contains non-UTF8 bytes; `to_string_lossy()` is strictly better | A | `pty_manager.rs:83` | Changed to `&h.to_string_lossy()` |

#### Discarded (false positives)

| Finding | Flagged by | Reason discarded |
|---------|-----------|------------------|
| App.tsx:141 splice without bounds check | A | `real` is found from `discovered.find()` and nothing modifies the array between find and splice; `indexOf` always returns ≥0 |
| usePtyActivity stale callbacks after unmount | A | Cleanup removes all event listeners via `unlisteners`; handlers cannot fire after cleanup |
| sessions.rs UUID length-only check | A | No security impact; non-UUID JSONL files fail `read_jsonl_header` gracefully |
| metadata.rs break after deletion | A | Correct — session IDs are unique across project directories; break after first match is intended |
| App.tsx:238 persistGroups stale closure | B | `persistGroups` IS in the deps array; JS hoisting makes it accessible; repeated as false positive from Round 7 |
| hook_server.rs header parsing | A | ASCII lowercase is length-preserving; `line[15..]` extracts the correct slice from the original |
| Sidebar 21 props / large component | B | Architectural observation; accepted per minimum-viable-solution policy |
| tabStyle duplication MainPane/CommandPalette/Settings | B | Each differs: MainPane has `fontWeight:500`/`minHeight:24`; CommandPalette has `fontWeight:600`/`fontFamily`; Settings uses different sizes |

---

### 2026-04-14 — Round 7 (dual-reviewer)

**Linting:** `cargo fmt` clean, `clippy` 1 accepted warning, `biome` 0 errors / 50 warnings, 111/111 tests, 100% statement coverage / 91.81% branch.

#### Confirmed and fixed

| Severity | Finding | Flagged by | File | Fix |
|----------|---------|-----------|------|-----|
| MEDIUM | `handleActivateGroupAtSlot` captures `configDir` in `[]`-dep `useCallback` — stale after profile switch; writes active-group localStorage key under wrong profile | B | `App.tsx:254` | Changed `configDir` → `configDirRef.current`, consistent with `handlePtyExit` |
| LOW | `is_alphanumeric()` in session ID guard matches Unicode letters — stricter ASCII-only check is more appropriate for UUID validation | A | `metadata.rs:106` | Changed to `is_ascii_alphanumeric()` |

#### Discarded (false positives)

| Finding | Flagged by | Reason discarded |
|---------|-----------|------------------|
| `useFocusTrap` missing `onEscape` dep | A | `onEscape` IS in the dep array at line 32 |
| `App.tsx:238` critical missing dep on `persistGroups` | B | `persistGroups` IS in the dep array on that line |
| `pty_manager.rs` spawned timer threads not awaited | A | Fire-and-forget timer callbacks for session list refresh — intentional design |
| `handleActivateGroupAtSlot` configDir captured (critical) | B | Not critical — downgraded to medium and fixed as stale closure |
| Layout definitions duplicated across GridLayout/Sidebar/Settings | B | Already accepted in Round 5: different data formats for different rendering purposes |
| Multiple `useCallback` missing configDir in deps | B | Others (handleDeleteGroup:285, line 425) are re-created when `groups` changes, which happens on profile switch; stale window is negligible |
| `Math.random()` in `genId()` | A | UI group IDs only; no security requirement |
| Windows path regex in sidebarUtils | A | macOS-primary app; Windows tilde handling is best-effort |

---

### 2026-04-14 — Round 6 (dual-reviewer)

**Linting:** `cargo fmt` clean, `clippy` 1 accepted warning, `biome` 0 errors, 50 warnings, 111/111 tests.

#### Confirmed and fixed

| Severity | Finding | Flagged by | File | Fix |
|----------|---------|-----------|------|-----|
| HIGH | Windows `play_sound` interpolates `path` directly into PowerShell string — single quotes in path could break or inject code | A | `commands.rs:50` | Escape single quotes before interpolation: `path.replace('\'', "''")` |
| HIGH | `delete_session` builds file path from `session_id` without validation — `../` in session_id would traverse out of projects dir | A | `metadata.rs:108` | Added guard: reject session_id containing any char other than alphanumeric or `-` |
| MEDIUM | `listen()` promises in `TerminalPane` stored via `.then()` — if component unmounts before promise resolves, `unlisten` is never called | A | `TerminalPane.tsx:69-79` | Store promises directly; cleanup calls `.then((fn) => fn())` on each |

#### Discarded (false positives)

| Finding | Flagged by | Reason discarded |
|---------|-----------|------------------|
| `dropToSlot` / `dropToGroupSlot` dual aliases | B | Both aliases are intentionally exported and tested separately. Renaming is churn with no correctness benefit. |

---

### 2026-04-10 — Round 5 (dual-reviewer)

**Linting:** `cargo fmt` clean, `clippy` 1 accepted warning, `tsc` clean, `biome` 0 errors, 100/100 tests.

#### Confirmed and fixed

| Finding | Flagged by | File | Fix |
|---------|-----------|------|-----|
| `dropToSlot` / `dropToGroupSlot` 100% identical (50 lines each) | B | `groupOps.ts:40-142` | Extracted shared `dropSessionToSlot()`, both functions delegate to it |
| Focus trap logic duplicated 3x (20 lines each) | B | `CommandPalette.tsx`, `NewSessionModal.tsx`, `Settings.tsx` | Extracted `useFocusTrap` hook to `src/hooks/useFocusTrap.ts` |
| `groups.some` / `groups.map` / `groups.findIndex` in useEffect deps | A | `App.tsx:171,517-518` | Removed method refs, kept `groups` array as dependency |

#### Discarded (false positives)

| Finding | Flagged by | Reason discarded |
|---------|-----------|------------------|
| `sidebarUtils.ts:169` lowercase `/users/` regex | A, B | Line 168 calls `.toLowerCase()` first, so lowercase regex is correct. Test confirms: changing to `/Users/` breaks `isSessionIgnored` test. |
| Layout grid definitions duplicated 3x | B | Settings uses CSS grid-column/grid-row positions, Sidebar uses miniature icon cell positions, GridLayout uses CSS grid templates. Different data for different rendering purposes. |
| Non-null assertions in `useDragDrop.ts` | A | `findDragSource()` guarantees `data-drag` attribute exists before returning. `data-drag-id` and `data-drag-idx` are always set alongside `data-drag` in JSX. Assertions are safe. |
| TerminalPane effect cleanup leak | A | At time of audit, no leak observed — fixed in Round 6 with promise-based cleanup. |
| Tab style duplication (MainPane vs Settings) | B | Different font sizes (11px vs 12px), weights, and color logic. Not truly identical. |
| Hardcoded `LIGHT_IDS` in Settings | B | Brightness heuristic exists as fallback. Hardcoded set is intentional for known themes; custom themes use heuristic. |
| CommandPalette filtering differs from sidebarUtils | B | CommandPalette uses cmdk's built-in search. Sidebar uses custom matching. Different use cases. |

---

### 2026-04-10 — Round 2 (full-stack)

| Fix | File |
|-----|------|
| `SLOT_COUNTS` deduplicated from 3 files to 1 | `groupOps.ts` (exported), removed from `App.tsx`, `Sidebar.tsx` |
| `VALID_LAYOUTS` eliminated | `App.tsx` — replaced with `l in SLOT_COUNTS` |
| `.to_string()` on `Cow<str>` → `.into_owned()` | `journal.rs:90` |

### 2026-04-10 — Round 1 (Rust audit)

| Fix | File |
|-----|------|
| Duplicate `is_pid_alive` extracted | `utils.rs` |
| Duplicate `claude_projects_dir` extracted | `utils.rs` |
| Regex recompilation cached with `OnceLock` | `journal.rs` |
| `&PathBuf` → `&Path` in signature | `sessions.rs` |
| Hardcoded `/opt/homebrew/bin/claude` → PATH-resolved | `pty_manager.rs` |
| Hardcoded `/bin/zsh` → `$SHELL` | `pty_manager.rs` |
| Dead `#[allow(dead_code)]` + unused struct fields removed | `sessions.rs` |
| `impl Default` added for `PtyState` | `pty_manager.rs` |
| Redundant clone in `rename_session` | `metadata.rs` |
| `with_metadata` helper extracted | `metadata.rs` |
| `formatCwd` deduplicated (3x → 1) | `utils.ts` |
| `sessionDisplayName` deduplicated (3x → 1) | `utils.ts` |
| Modal styles deduplicated (2x → 1) | `utils.ts` |
| Menu item styles deduplicated (5x → 1) | `utils.ts` |
| `SidebarGroup` export removed (unused) | `sidebarUtils.ts` |
| `.flatten()` → `.map_while(Result::ok)` on Lines | `journal.rs` |

---

## Accepted patterns

| Pattern | Reason |
|---------|--------|
| `too_many_arguments` on `pty_spawn` | Tauri IPC boundary maps 1:1 to frontend args |
| `.lock().unwrap()` on `Mutex` | Poisoned mutex = unrecoverable; panicking is correct |
| Hand-rolled `parse_timestamp` | Avoids `chrono` dep; only used for sort ordering |
| `.flatten()` on `ReadDir` iterators | Directory errors are per-entry; skipping is desired |
| Biome a11y warnings (52) | Modal backdrops, drag targets, stopPropagation wrappers — configured as warn |
| Biome exhaustive-deps warnings | Intentionally limited deps to prevent re-subscription loops |
| `/users/` lowercase in `isSessionIgnored` | Input is `.toLowerCase()`'d first on the line above |
| Layout constants defined per-component | Different data (CSS grid positions vs icon positions vs templates) |
| Tailwind utility classes in components | Convention: Tailwind for layout, inline styles for dynamic/theme values |

---

## Round 5 — 2026-04-18

Dual-reviewer audit (Correctness & Safety + Architecture & Design).

### Fixed (10)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `pty_manager.rs:80` | Session ID not validated before shell interpolation | Added alphanumeric+hyphen validation at IPC boundary |
| 2 | `pty_manager.rs:143` | Env var keys from settings.json not validated | Added alphanumeric+underscore check, skip invalid keys |
| 3 | `App.tsx:506` | Control chars in pending_rename written to PTY | Strip chars < 32 and 127 before writing |
| 4 | `Sidebar.tsx:1342` | Inline display name logic duplicates `sessionDisplayName()` | Replaced with shared util call |
| 5 | `Settings.tsx:10` | `TILING_OPTIONS` duplicates `LAYOUT_ORDER` from groupOps | Import from groupOps |
| 6 | `Sidebar.tsx:879` | Redundant `autoCorrect`/`autoCapitalize`/`spellCheck` after `{...noAutocorrect}` spread | Removed duplicates |
| 7 | `MainPane.tsx:31` | Unnecessary `useEffect` setting state to same initial value | Removed |
| 8 | `usePtyActivity.ts:27` | Plain objects used instead of `useRef` for callback refs | Changed to `useRef` |
| 9 | `commands.rs:72` | Profile ID not URL-encoded in window URL | Added percent-encoding |
| 10 | `App.tsx:31` | `Math.random()` for group IDs | Changed to `crypto.randomUUID()` |

### Discarded

| Finding | Reason |
|---------|--------|
| TOCTOU race in lock acquisition | Requires two instances within same millisecond; risk is negligible |
| Hook server fixed port 23816 | Known limitation; dynamic port would require service discovery |
| `is_pid_alive` not Windows-portable | Windows support is untested; will address when Windows CI is added |
| `metadata.rs` save() silent failures | Matches existing error-handling pattern; metadata is non-critical |
| `parse_timestamp` leap year approximation | Accepted pattern per checklist |
| Sidebar/Settings/App component length | Large but well-structured; extraction would add indirection without clear benefit |
| `theme.terminal` in TerminalPane deps | Intentional: ensures terminal recreates with correct theme on profile switch |
| Layout cell data duplication | Different shapes per component (CSS strings vs icon grids); shared constant wouldn't simplify |
| `hook_server.rs` settings.json no atomic write | Localhost-only, single writer; risk is negligible |
| `sessions.rs` alive_cwd_pids overwrite on dup cwd | Only one Claude process per cwd in practice |

---

## Round 6 — 2026-04-18 (convergence round 1)

Windows support in scope. Dual-reviewer audit.

### Fixed (9)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `utils.rs:5` | `is_pid_alive` uses Unix `kill -0`, broken on Windows | Added `#[cfg(unix)]`/`#[cfg(windows)]` with `tasklist` fallback |
| 2 | `pty_manager.rs:86` | Tilde expansion only handles `~/`, not `~\` | Added `~\\` check for Windows paths |
| 3 | `pty_manager.rs:138-171` | Env prefix `KEY=val cmd` is bash-only, breaks on Windows | Replaced with `cmd_builder.env()` on all platforms |
| 4 | `journal.rs:95` | `encode_path_for_claude` strips `/` only, not `\` or drive letters | Handle both separators and drive prefix |
| 5 | `hook_server.rs:10` | Hook command uses `curl \|\| true` (bash-only) | Added Windows PowerShell `Invoke-WebRequest` variant |
| 6 | `StatusDot.tsx` | Base styles repeated across all 4 branches | Extracted shared `base` style object |
| 7 | `utils.ts:10` | `formatCwd` only handles `/Users/`, not Linux `/home/` | Added `/home/` to regex |
| 8 | `useSessions.ts:11,37` | `error` state declared but never consumed by callers | Removed |
| 9 | `commands.rs:7` | Custom themes path hardcoded instead of using `manager_config_dir()` | Use shared util |

## Round 7 — 2026-04-18 (convergence round 2)

Both auditors reported **zero issues**. Converged.

---

## Round 8 — 2026-04-18 (convergence round 1, fresh)

Fresh dual-reviewer audit with Windows support in scope.

### Fixed (5)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `utils.rs:16` | `is_pid_alive` Windows tasklist substring false positives | Use CSV format and exact PID column match |
| 2 | `journal.rs:95` | `encode_path_for_claude` greedy trim strips valid leading chars | Only strip drive prefix (letter + colon), not all leading alpha |
| 3 | `utils.ts:14` | `pathBasename` only splits on platform separator, misses mixed paths | Split on both `/` and `\` |
| 4 | `App.tsx:505` | rename-on-waiting fires from any window, not just PTY owner | Guard with `alivePtys.has(session.session_id)` |
| 5 | `Sidebar.tsx:443` | control-char filter missing from `commitRename` (only in auto-rename) | Added same filter to `commitRename` |

### Discarded

| Finding | Reason |
|---------|--------|
| cmd.exe /C shell wrapping | User controls their own shell config; claude_cmd is validated |
| profiles_path ~/.config on Windows | Design decision, consistent across app |
| navigator.platform deprecated | Works in Tauri WKWebView/WebView2 today |
| HTTP method validation in hook_server | Localhost only, valid payload required |
| Sessions sort with 0 timestamp | Fallback search handles it |
| macOS modifier glyphs hardcoded | Cosmetic, platform detection throughout is out of scope |

## Round 9 — 2026-04-18 (convergence round 2)

Both auditors reported **zero issues**. Converged.

---

## Round 10 — 2026-04-22 (convergence round 1)

### Fixed (7)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `App.tsx:612` | Cmd+W deletes without confirmation | Added `ask()` dialog |
| 2 | `App.tsx:527` | Pending PTY match uses basename only | Full cwd match |
| 3 | `App.tsx:297-338` | 3 handlers bypass persistGroups | Use persistGroups callback |
| 4 | `utils.ts:7` | formatCwd only handles C:\ drive | Any drive letter `[A-Z]` |
| 5 | `Settings.tsx:201` | Hotkeys table says "Archive" | Updated to "Delete" |
| 6 | `Settings.tsx:1388` | Guide lists "Archive" action | Replaced with "Rename" |
| 7 | `App.tsx:96` | handlePtyExit doesn't filter empty groups | Added `.filter()` |

## Round 11 — 2026-04-22 (convergence round 2)

Both auditors reported **zero issues**. Converged.
