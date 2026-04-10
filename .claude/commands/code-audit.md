Perform a pedantic code audit on the entire codebase. Act as a senior engineer who cares deeply about clean code, good design, and correctness.

## Process

1. Read every `.rs` file in `src-tauri/src/` and every `.ts`/`.tsx` file in `src/`
2. Run `cd src-tauri && cargo fmt -- --check && cargo clippy` for Rust
3. Run `bunx biome check` for TypeScript
4. Audit each file against both checklists below
5. Fix every issue found (except accepted patterns documented in `docs/dev.md`)
6. Run `bun run test` to verify nothing broke
7. Re-run linting to verify fixes compile
8. Append findings to the "Audit log" section of `docs/dev.md`

---

## Rust Checklist (`src-tauri/src/`)

### DRY
- [ ] No duplicate functions across modules
- [ ] No duplicate logic (same if/else pattern repeated)
- [ ] Shared code extracted to `utils.rs`

### SOLID
- [ ] Single responsibility: each function does one thing
- [ ] Functions under 50 lines where possible
- [ ] Structs only contain fields they use

### Clean Code
- [ ] No `#[allow(dead_code)]` hiding genuinely dead code
- [ ] No `unwrap()` on fallible ops in production paths (mutex locks excepted)
- [ ] `&Path` not `&PathBuf` in function signatures
- [ ] `&str` not `&String` in function signatures
- [ ] Imports organized: std, external crates, internal crates
- [ ] No hardcoded paths that should be configurable or resolved from env
- [ ] Constants at module top, named descriptively
- [ ] No commented-out code or dead exports

### Performance
- [ ] No regex recompilation in hot paths (use `OnceLock`)
- [ ] No unnecessary `.clone()` or `.to_string()`
- [ ] No unnecessary allocations in loops

### Rust Idioms
- [ ] `impl Default` alongside `new()` where applicable
- [ ] Use `?` operator instead of nested `if let Ok`
- [ ] Prefer `map_while(Result::ok)` over `.flatten()` on `Lines`
- [ ] Prefer `let ... else` for early returns

---

## TypeScript Checklist (`src/`)

### DRY
- [ ] No duplicate logic across components or hooks
- [ ] Pure logic in `sidebarUtils.ts` or `groupOps.ts`, not in components
- [ ] Shared types/constants extracted, not redefined
- [ ] No repeated style objects — extract to shared const

### SOLID
- [ ] Single responsibility: components render, hooks manage state, utils compute
- [ ] No god components doing everything (render + fetch + compute + state)
- [ ] Interfaces preferred over inline types for reuse
- [ ] Props interfaces explicit, not inline

### Clean Code
- [ ] No `any` types — use `unknown` and narrow
- [ ] All `if` statements use curly braces
- [ ] No commented-out code
- [ ] No dead exports or unused imports
- [ ] Inline styles, not CSS classes (except `index.css` for globals/keyframes)
- [ ] No magic numbers — named constants
- [ ] No unnecessary type assertions (`as`)
- [ ] Consistent naming (camelCase functions, PascalCase components/types)

### Performance
- [ ] `useMemo`/`useCallback` only where measurably needed (not premature)
- [ ] No unnecessary re-renders from unstable references
- [ ] Event handlers not recreated on every render when passed to lists
- [ ] No expensive computation in render path without memoization

### UI & Accessibility
See `/ui-audit` for the full visual design + WCAG 2.2 AA checklist.

---

## Accepted Patterns

| Pattern | Reason |
|---------|--------|
| `too_many_arguments` on Tauri IPC commands | IPC boundary maps 1:1 to frontend args |
| `.lock().unwrap()` on `Mutex` | Poisoned mutex = unrecoverable; panicking is correct |
| Hand-rolled `parse_timestamp` | Avoids `chrono` dep; only used for sort ordering |
| `.flatten()` on `ReadDir` iterators | Directory errors are per-entry; skipping is desired |
| `--text-very-muted` contrast < 4.5:1 | Decorative/non-essential elements only |
