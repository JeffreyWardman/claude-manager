# Code Audit Report

**Last audit:** 2026-04-10 (5 rounds, dual-reviewer process)
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
| TerminalPane effect cleanup leak | A | Effect properly returns cleanup function. `ptyId` changes are rare (session switch). No leak observed. |
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
