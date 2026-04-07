# claude-manager

A macOS desktop app for managing multiple [Claude Code](https://claude.ai/code) sessions side by side. View terminals in a grid, organise sessions into named groups, and drag to rearrange — all from a single window.

![claude-manager screenshot](docs/screenshot.png)

## Features

- **Multi-pane grid** — view 1, 2, or 4 Claude Code terminals simultaneously (1×1, 2×1, 1×2, 2×2 layouts)
- **Session groups** — collect related sessions into named groups and switch between them instantly
- **Drag and drop** — rearrange sessions within a group or move them between groups
- **Live activity indicators** — see at a glance which sessions are computing, waiting, or idle
- **Command palette** — `⌘K` to jump to any session
- **Themes** — multiple built-in colour schemes

## Requirements

- macOS 13 (Ventura) or later
- [Claude Code](https://claude.ai/code) installed and at least one session started

## Installation

### Homebrew (recommended)

```sh
brew install --cask JeffreyWardman/tap/claude-manager
```

### Direct download

Download the latest `.dmg` from the [Releases](https://github.com/JeffreyWardman/claude-manager/releases) page, open it, and drag **claude-manager** to `/Applications`.

### curl installer

```sh
curl -fsSL https://github.com/JeffreyWardman/claude-manager/releases/latest/download/install.sh | sh
```

## Building from source

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable | `curl https://sh.rustup.rs -sSf \| sh` |
| Bun | ≥ 1.0 | `curl -fsSL https://bun.sh/install \| bash` |
| Xcode Command Line Tools | latest | `xcode-select --install` |

### Steps

```sh
git clone https://github.com/JeffreyWardman/claude-manager.git
cd claude-manager
bun install
bun run build          # production build → src-tauri/target/release/bundle/
```

To run in development mode with hot reload:

```sh
bun run start
```

### Running tests

```sh
bun test               # unit tests (vitest)
bun test:watch         # watch mode
```

## Contributing

Contributions are welcome. Please:

1. Fork the repo and create a branch from `main`
2. Run `bun test` and make sure all tests pass before opening a PR
3. Keep PRs focused — one feature or fix per PR
4. For significant changes, open an issue first to discuss the approach

### Project structure

```
src/                    React + TypeScript frontend
  components/           UI components (Sidebar, GridLayout, …)
  hooks/                Custom React hooks
  groupOps.ts           Pure functions for group drag-drop logic
  groupOps.test.ts      Unit tests
src-tauri/src/          Rust backend
  pty_manager.rs        PTY spawning and I/O
  sessions.rs           Session discovery and persistence
  commands.rs           Tauri IPC commands
```

## License

[MIT](LICENSE)
