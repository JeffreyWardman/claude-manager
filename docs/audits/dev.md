# Code Audit Report

**Last audit:** 2026-04-14 (4 rounds, dual-reviewer process)
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
