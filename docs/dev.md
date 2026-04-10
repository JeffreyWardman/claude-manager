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
