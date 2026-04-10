# Claude Manager

## Architecture

Tauri 2 desktop app: Rust backend + React/TypeScript frontend.

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, xterm.js for terminal rendering
- **Backend**: Rust with Tauri 2, portable-pty for PTY management
- **State**: localStorage for UI state (groups, layouts, preferences). No database.
- **Sessions**: Discovered from `~/.claude/sessions/*.json` (pid files) and `~/.claude/projects/*/*.jsonl` (conversation files)
- **Metadata**: `~/.claude/manager/metadata.json` for display names, archive state, pending renames
- **Lockfiles**: `~/.claude/manager/locks/{id}.lock` prevents two windows resuming the same session

## Key files

```
src/App.tsx                  Main app shell, keyboard shortcuts, state orchestration
src/components/Sidebar.tsx   Session list, groups, search, filters, context menus
src/components/GridLayout.tsx Pane grid with CSS grid templates
src/components/MainPane.tsx  Session header + terminal panes (claude/shell/split)
src/components/TerminalPane.tsx xterm.js terminal with PTY connection
src/components/Settings.tsx  Settings modal (preferences, themes, hotkeys, guide, about)
src/components/StatusDot.tsx Activity indicator (computing/unread/waiting/active/offline)
src/sidebarUtils.ts         Sorting, grouping, search, ignore pattern logic (pure functions)
src/groupOps.ts             Group slot operations (drop, swap, add, remove — pure functions)
src/hooks/usePtyActivity.ts PTY activity tracking (computing/waiting state machine)
src/hooks/useSessions.ts    Session polling from backend
src/themes.ts               20+ built-in theme definitions
src/useDragDrop.ts          Pointer-based drag-and-drop (no HTML5 DnD — broken in WKWebView)
src-tauri/src/pty_manager.rs PTY lifecycle, lockfiles, session-changed events
src-tauri/src/sessions.rs   Session discovery from Claude Code files
src-tauri/src/commands.rs    Tauri IPC commands (themes, windows, sound)
src-tauri/src/metadata.rs   Local metadata store (rename, archive, delete)
```

## Code style — TypeScript

- All `if` statements must use curly braces, even single-line
- Biome handles formatting (tabs, double quotes, 100 char width) and linting
- Run `bunx biome check --write` to format
- Pure logic belongs in `sidebarUtils.ts` or `groupOps.ts`, not in components
- Inline styles, not CSS classes (except index.css for global/keyframe rules)
- No `any` types. Prefer `unknown` and narrow.
- Tests go next to source files (`foo.test.ts` alongside `foo.ts`)

## Code style — Rust

- `cargo fmt` with rustfmt.toml (edition 2021, 4 spaces, 100 width)
- `cargo clippy` should pass (warnings acceptable for `too_many_arguments` on Tauri commands)
- Tauri commands are the IPC boundary — validate inputs there, trust internal code
- PTY operations spawn threads; use `Arc<Mutex<>>` for shared state

## Testing

- `bun run test` — vitest, 100+ tests
- Pure logic is unit tested (groupOps, sidebarUtils, activityState)
- React components and Tauri IPC are not unit tested (integration-heavy, tested manually)
- Add tests when adding new pure logic functions

## Linting

- Frontend: `bunx biome check` (0 errors, warnings acceptable for exhaustive deps and a11y click handlers)
- Backend: `cargo fmt -- --check && cargo clippy`
- CI runs both on PR

## Documentation

Always update all three doc surfaces when changing user-facing features:
1. `README.md` — usage section
2. `Settings > Guide` tab — in-app docs (`src/components/Settings.tsx`)
3. `CONTRIBUTING.md` — if it affects dev workflow

Audit docs go in `docs/audits/`.

## Accessibility

WCAG 2.1 AA compliant (5 audit rounds, all passing). Key patterns:
- All modals: `role="dialog"`, `aria-modal`, focus traps
- All icon buttons: `aria-label`
- All collapse buttons: `aria-expanded`
- Status dots: `role="status"`, `aria-label`
- `prefers-reduced-motion` disables animations
- Global `*:focus-visible` outline
- Color contrast meets 4.5:1 on all text

## CI/CD

- `.github/workflows/ci.yml` — runs on PRs: biome, tsc, vitest, rustfmt, clippy
- `.github/workflows/release.yml` — manual dispatch: commitizen bump, Tauri build (macOS + Linux + Windows), GitHub Release
- Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) for version bumps

## Capabilities (Tauri permissions)

`src-tauri/capabilities/default.json` — applies to `main*` windows:
- Window: start-dragging, minimize, create
- FS: read text/dir, exists
- Dialog: open
- Shell: execute (for `afplay`/`paplay` sound playback)

Add new permissions here when adding Tauri plugin features.
