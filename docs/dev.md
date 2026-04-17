# Rust Coding Standards

## Toolchain

- **Edition**: 2021
- **Formatter**: `cargo fmt` (default rustfmt settings)
- **Linter**: `cargo clippy` (default settings)
- **Build**: Tauri 2 (`cargo tauri dev` / `cargo tauri build`)

All Rust source lives under `src-tauri/src/`.

## Formatting

Run from `src-tauri/`:

```sh
cargo fmt -- --check   # verify
cargo fmt              # auto-fix
```

No `rustfmt.toml` — uses rustfmt defaults (edition 2021, 4-space indent).

## Linting

Run from `src-tauri/`:

```sh
cargo clippy
```

Or use the slash commands:

```sh
/code-audit      # pedantic full-stack audit (Rust + TypeScript)
```

### Accepted warnings

| Warning | Location | Reason |
|---------|----------|--------|
| `too_many_arguments` | `pty_manager.rs:pty_spawn` | Tauri IPC commands receive all args individually; restructuring adds unnecessary complexity |

All other clippy warnings should be fixed.

## Module structure

```
utils.rs          Shared utilities (is_pid_alive, claude_projects_dir)
commands.rs       Tauri IPC commands (themes, windows, sound, platform)
sessions.rs       Session discovery from Claude Code pid/jsonl files
pty_manager.rs    PTY lifecycle, lockfiles, scrollback, session-changed events
journal.rs        Conversation JSONL parsing, system tag stripping
metadata.rs       Local metadata store (rename, archive, delete)
lib.rs            App initialization, Tauri builder, module exports
main.rs           Entry point (delegates to lib)
```

## Code conventions

- **Shared code** goes in `utils.rs` — no duplicate functions across modules
- **Tauri commands** are the IPC boundary — validate inputs there, trust internal code
- **PTY operations** spawn threads; use `Arc<Mutex<>>` for shared state
- **Error handling**: Return `Result<T, String>` from Tauri commands. Use `map_err(|e| e.to_string())`.
- **No `unwrap()`** on fallible operations in production paths. `Mutex::lock().unwrap()` is acceptable (poisoned mutex should panic).
- **Function signatures**: Accept `&Path` not `&PathBuf`. Accept `&str` not `&String`.
- **`impl Default`** alongside `new()` when the type supports it
- **Regex**: Cache compiled regexes with `std::sync::OnceLock` — never recompile in loops
- **Environment**: Use `$SHELL` for the user's shell. Resolve CLI tools via `PATH`, not hardcoded paths.
- **Serde structs**: Only include fields you actually read. Don't use `#[allow(dead_code)]` to hide unused fields.
- **Modules**: One file per domain. Register new modules in `lib.rs`.

## Accepted patterns

| Pattern | Reason |
|---------|--------|
| `too_many_arguments` on Tauri commands | IPC boundary maps 1:1 to frontend args |
| `.lock().unwrap()` on `Mutex` | Poisoned mutex = unrecoverable; panicking is correct |
| Hand-rolled `parse_timestamp` | Avoids `chrono` dep; only used for sort ordering |
| `.flatten()` on `ReadDir` iterators | Directory errors are per-entry; skipping bad entries is desired |

---

## Audit log

### 2026-04-10 — Pedantic Rust audit

**cargo fmt**: Clean.
**cargo clippy**: 1 accepted warning (`too_many_arguments` on `pty_spawn`).

#### DRY violations fixed

1. **Duplicate `is_pid_alive`** — identical implementations in `sessions.rs:50` and `pty_manager.rs:20`. Extracted to `utils.rs`. Both modules now use `crate::utils::is_pid_alive`.

2. **Duplicate `claude_projects_dir`** — identical in `sessions.rs:70` and `journal.rs:88`. Extracted to `utils.rs`. Both modules now use `crate::utils::claude_projects_dir`.

3. **Redundant clone in `rename_session`** — `metadata.rs:48-58` had the same `if trimmed.is_empty() { None } else { Some(...) }` pattern twice. Consolidated to a single computation with one `.clone()`.

#### Clean code fixes

4. **`#[allow(dead_code)]` hiding dead fields** — `sessions.rs:SessionFile` had `session_id` and `started_at` fields that were deserialized but never read. Removed the unused fields and the `#[allow(dead_code)]` attribute. Serde ignores unknown JSON fields by default.

5. **`&PathBuf` in function signature** — `sessions.rs:read_jsonl_header` accepted `&PathBuf` instead of `&Path`. Changed to `&Path` (idiomatic Rust; `&PathBuf` auto-derefs at call sites).

6. **Missing `Default` impl** — `PtyState` had `new()` but no `Default`. Added `impl Default for PtyState` with `new()` delegating to it.

#### Performance fix

7. **Regex recompilation on every call** — `journal.rs:strip_system_tags` compiled 4 regexes on every invocation (called per conversation entry). Extracted to `strip_regexes()` using `std::sync::OnceLock` for one-time initialization.

#### Portability fixes

8. **Hardcoded `/opt/homebrew/bin/claude`** — `pty_manager.rs:122` only worked on macOS ARM with Homebrew. Changed to `claude` (resolved via `PATH` in the login shell). Works on Intel Mac, Linux, npm global install, etc.

9. **Hardcoded `/bin/zsh`** — `pty_manager.rs:115`. Changed to `std::env::var("SHELL")` with `/bin/sh` fallback. Respects the user's configured shell.

#### Import hygiene

10. **Wrapper functions eliminated** — `sessions.rs` had thin wrappers (`is_process_alive`, `claude_projects_dir`) that just called `utils::`. Inlined the `crate::utils::` calls directly at call sites.

11. **Import ordering** — `pty_manager.rs` had `use crate::utils::is_pid_alive` placed between function definitions instead of with other imports. Moved to import block.

### 2026-04-17 — Full-stack code audit (Auditor A + B)

**Linting**: cargo fmt clean, 1 accepted clippy warning, 0 biome errors, 48 accepted biome warnings, 111 tests pass.

#### Fixed (confirmed by both auditors)

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | HIGH | `metadata.rs` | Session ID validation missing length check — only checked charset, not UUID length. Path traversal risk. | Created `utils::is_valid_session_id()` (36 chars + charset). Used in `metadata.rs` and `hook_server.rs`. |
| 2 | HIGH | `metadata.rs` | `delete_session` didn't verify canonicalized path was within projects dir before deletion. | Added `canonicalize()` check: target must start with canonical projects dir. |
| 3 | HIGH | `hook_server.rs` | Session ID from hook request used in event names without validation. | Added `is_valid_session_id()` guard before processing hook payload. |
| 4 | MEDIUM | `ThemeContext.tsx` | `isValidTheme()` only checked `id`, `name`, `bg` existence — didn't validate nested structure (`bg.main`, `bg.sidebar`, `text.primary`, `item.selected`). Malformed custom themes could crash. | Added full structural validation of required nested properties. |
| 5 | LOW | Multiple `.rs` | Inconsistent error message "no home dir" across modules. | Extracted `utils::NO_HOME_DIR` constant, used in all 3 locations. |

#### Discarded (false positives)

| Finding | Reason |
|---------|--------|
| A#1: Race condition in PTY state — old reader + new spawn | `Arc::ptr_eq` check at line 206 correctly handles this: old reader sees different Arc, skips cleanup. The "window" described doesn't cause data loss — both PTYs emit to different event names since the old one exits immediately. |
| A#4: `pty_write` silent success when PTY not found | By design — focus events (`\x1b[I`/`\x1b[O`) are sent speculatively and should not error. Frontend already handles spawn failures separately. |
| A#5: Lock poisoning risk in `pty_resize` | Accepted pattern per CLAUDE.md. Mutex poisoning = unrecoverable panic, which is correct. |
| A#6: Untrusted file path in profile config | `shell_escape::escape()` handles the shell injection vector. The env vars come from the user's own `settings.json` in their profile directory — same trust level as `~/.zshrc`. |
| A#8: Promise from `listen()` not awaited | Tauri's `listen()` resolves synchronously in practice (registers in the IPC layer). The `.then()` pattern is used throughout the codebase consistently and hasn't caused issues. |
| A#9: Off-by-one in `parse_timestamp` leap years | Accepted pattern per CLAUDE.md. Only used for sort ordering, not calendar display. Error is < 1 day per century. |
| A#15: Unvalidated localStorage sidebar width | Width is clamped by `Math.max(MIN, Math.min(MAX, ...))` during resize. A corrupt value would be fixed on first resize interaction. |
| B#5: App.tsx too large (812 lines) | Acknowledged but not actionable in this round — extracting hooks requires careful state management review. Filed for future refactor. |
| B#7: Sidebar too large | Same — extracting subcomponents requires refactoring prop threading. Filed for future. |
| B#8: Inconsistent command return types | Some commands (e.g. `get_sessions`) intentionally return empty on error rather than failing the IPC call, which would show as a console error to the user. |
| B#9: pty_spawn 9 parameters | Accepted pattern. |
| B#10: Sidebar 26 props | Acknowledged for future refactor. Grouping into action unions is a good direction. |
| B#16: labelRef in useDragDrop | Used on lines 60 and 94 — not dead code. |
| B#21: N+1 session file reads | Acceptable at current scale (3s polling, typically < 100 sessions). |
| B#22: Lock files not cleaned on crash | `acquire_lock()` already checks `is_pid_alive()` — stale locks from crashed processes are overwritten on next spawn. |

### 2026-04-17 — Round 2

**Linting**: cargo fmt clean, 1 accepted clippy warning, 0 biome errors, 111 tests pass.

#### Fixed

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | MEDIUM | `sidebarUtils.ts`, `utils.ts`, `Settings.tsx` | Home dir regex (`/Users/`) duplicated in 4 places with inconsistent case handling. `sessionMatchesFolder` didn't lowercase before replacing, causing match failures on case-insensitive filesystems. | Made `formatCwd` in utils.ts case-insensitive (`/[Uu]sers/`). Replaced all inline regexes with `formatCwd()`. |
| 2 | HIGH | `commands.rs` | PowerShell command injection in Windows sound playback — backtick metacharacters in file path could execute arbitrary commands. | Pass path via `$env:__CM_SOUND` env var instead of string interpolation. Added `-NoProfile` flag. |

#### Deferred

| Finding | Reason |
|---------|--------|
| B#2: Layout cell definitions duplicated in Sidebar + Settings | Real DRY violation but low-risk. Both maps are stable (only change when layouts are added). Extracting to shared module is planned but deferred to avoid churn. |
| B#4: Settings.tsx 1525 lines | Acknowledged. Split into sub-components planned for future. |
| B#6: Config directory reading pattern repeated | Three implementations have different fallback behavior. Unifying risks breaking edge cases. |
| B#7: tabStyle duplicated in MainPane + CommandPalette | Implementations differ slightly (font sizes, padding). Not worth extracting for 2 usages. |
| B#8: usePtyActivity complex state | Already well-commented with clear constants. Reducer pattern would add complexity without benefit at this scale. |
| B#9: JSONL discovery strategies differ | Intentional — journal needs exact match first for performance, sessions need full scan for completeness. |
| A#3: configDir missing from TerminalPane effect deps | By design — configDir only changes on profile switch, which unmounts/remounts all TerminalPanes anyway. Adding it would cause unnecessary PTY respawns. |

### 2026-04-17 — Round 3

**Auditor A**: No new issues found.
**Auditor B**: 4 minor findings.

#### Fixed

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | LOW | `sidebarUtils.ts` | Duplicate platform detection — `isWin` reimplemented instead of using `isWindows` from `utils.ts`. | Exported `isWindows` from `utils.ts`, imported in `sidebarUtils.ts`. Removed inline duplicate. |

#### Discarded

| Finding | Reason |
|---------|--------|
| B#3: `dropToSlot` unused export | False positive — imported and used in `App.tsx:12,319`. |
| B#4: dragState module-level mutable state | Intentional — ephemeral pointer state during drag. React state would cause unnecessary re-renders on every pointermove. |
