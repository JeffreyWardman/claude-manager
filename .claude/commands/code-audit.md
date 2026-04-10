Perform a pedantic code audit using two independent reviewers, then collate findings.

## Process

### Step 1: Linting

Run in parallel:
- `cd src-tauri && cargo fmt -- --check && cargo clippy`
- `bunx biome check`
- `bunx vitest run --coverage`

Fix any errors before proceeding. Record coverage numbers for the report.

### Step 2: Two independent auditors (run in parallel as agents)

**Auditor A — Correctness & Safety** (systems engineer, 10 years Rust):
Read every `.rs` file in `src-tauri/src/` and every `.ts`/`.tsx` file in `src/`. Focus on:
- Correctness bugs: race conditions, logic errors, off-by-one, null/undefined risks
- Safety: injection risks, path traversal, untrusted input
- Error handling: silent failures, swallowed errors, missing error paths
- Resource leaks: unclosed handles, event listeners not cleaned up
- Type safety: unsafe casts, assertions that could fail
- Edge cases: empty arrays, missing keys, Unicode paths, concurrent access

**Auditor B — Architecture & Design** (senior frontend architect, large-scale React):
Read every `.rs` file in `src-tauri/src/` and every `.ts`/`.tsx` file in `src/`. Focus on:
- DRY: duplicate logic, constants, patterns, or style objects across files
- SOLID: single responsibility violations, interface segregation
- API design: function signatures, prop interfaces, naming
- Maintainability: functions too long, deeply nested logic
- Dead code: unused exports, unreachable branches
- Consistency: inconsistent patterns for similar operations

Both auditors report: exact file:line, severity (critical/high/medium/low), description, fix.

### Step 3: Collate and verify

Cross-reference both reports. For each finding:
1. If both flagged it → high confidence, verify and fix
2. If one flagged it → verify by reading the actual code before acting
3. Run tests to confirm findings are real (not false positives)
4. Discard false positives with reasoning

### Step 4: Fix and verify

- Fix all confirmed issues
- Run `bun run test` to verify nothing broke
- Re-run linting to verify fixes compile
- Append findings to `docs/audits/dev.md`

### Step 5: Converge (only if invoked with `converge`)

If the user ran `/code-audit converge`:

Repeat steps 1-4 until a round finds **zero confirmed issues**. Each round:
1. Re-run both auditor agents (they must re-read the code — previous fixes may have introduced new issues)
2. Collate and verify as before
3. Fix confirmed issues
4. If zero issues found this round → stop, report "Converged after N rounds"
5. If issues found → fix and loop

Safety: stop after 5 rounds regardless and report remaining issues. Do not loop forever.

---

## Checklists (for both auditors)

### Rust (`src-tauri/src/`)

- [ ] No duplicate functions across modules; shared code in `utils.rs`
- [ ] Single responsibility per function; functions under 50 lines
- [ ] Structs only contain fields they use
- [ ] No `#[allow(dead_code)]` hiding genuinely dead code
- [ ] No `unwrap()` on fallible ops (mutex locks excepted)
- [ ] `&Path` not `&PathBuf`, `&str` not `&String` in signatures
- [ ] Imports organized: std, external crates, internal crates
- [ ] No hardcoded paths; constants at module top
- [ ] No regex recompilation in hot paths (use `OnceLock`)
- [ ] No unnecessary `.clone()` or `.to_string()`
- [ ] `impl Default` alongside `new()`; `?` over nested `if let Ok`
- [ ] `map_while(Result::ok)` over `.flatten()` on `Lines`

### TypeScript (`src/`)

- [ ] No duplicate logic across components/hooks; pure logic in utils
- [ ] Shared types/constants extracted; no repeated style objects
- [ ] Single responsibility: components render, hooks state, utils compute
- [ ] No `any` types; all `if` with curly braces; no commented-out code
- [ ] No dead exports or unused imports; no magic numbers
- [ ] No unnecessary `as` casts; consistent naming
- [ ] No unnecessary re-renders from unstable references

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
| Biome a11y warnings (52) | Modal backdrops, drag targets, stopPropagation wrappers — configured as warn |
| Biome exhaustive-deps warnings | Intentionally limited deps to prevent re-subscription loops |
