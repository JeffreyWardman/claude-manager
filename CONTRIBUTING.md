# Contributing

## Development setup

```sh
bun install
bun run start
```

This starts the Vite dev server and the Tauri app with hot reload.

## Tests

```sh
bun test
bun run test:watch
```

## Project structure

```
src/                    React + TypeScript frontend
  components/           UI components (Sidebar, GridLayout, Settings, ...)
  hooks/                Custom React hooks (useSessions, usePtyActivity)
  themes.ts             Built-in theme definitions
  groupOps.ts           Pure functions for group/slot operations
src-tauri/src/          Rust backend
  pty_manager.rs        PTY spawning and I/O
  sessions.rs           Session discovery from Claude Code files
  metadata.rs           Local session metadata (names, archive state)
  commands.rs           Tauri IPC commands
```

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) with [commitizen](https://commitizen-tools.github.io/commitizen/) for automated version bumps.

Prefix your commits accordingly:

- `feat:` — new feature (bumps minor)
- `fix:` — bug fix (bumps patch)
- `feat!:` or `BREAKING CHANGE:` — breaking change (bumps major)
- `chore:`, `docs:`, `refactor:`, `test:` — no version bump

## Pull requests

1. Fork the repo and branch from `main`
2. Run `bun test` before opening a PR
3. Keep PRs focused — one feature or fix per PR
4. For significant changes, open an issue first

## Releases

Releases are triggered manually via GitHub Actions (`Actions > Release > Run workflow`). The workflow:

1. Runs commitizen to determine the next version from commit history
2. Bumps version across `package.json`, `Cargo.toml`, and `tauri.conf.json`
3. Builds platform bundles (macOS `.dmg`, Linux `.deb`/`.rpm`/`.AppImage`, Windows `.msi`/`.exe`)
4. Commits the version bump, creates a git tag, and publishes a GitHub Release with the build artifacts

If no conventional commits warrant a bump since the last tag, the workflow exits without releasing.
