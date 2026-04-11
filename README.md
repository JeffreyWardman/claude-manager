# Claude Manager

A macOS desktop app for managing multiple [Claude Code](https://claude.ai/code) sessions side by side. View terminals in a grid, organise sessions into named groups, and drag to rearrange — all from a single window.

### Star History

[![Star History Chart](https://api.star-history.com/svg?repos=jeffreywardman/claude-manager&type=Date)](https://www.star-history.com/#jeffreywardman/claude-manager&Date)

## Features

- **Multi-pane grid** — tiling layouts from 1x1 up to 3x2
- **Session groups** — collect related sessions into named groups and switch between them
- **Drag and drop** — rearrange sessions within a group or move them between groups
- **Live activity indicators** — see at a glance which sessions are computing, completed (unread), or idle
- **Sidebar search** — filter groups and sessions with optional scoped search
- **Command palette** — `Cmd+K` to jump to any session
- **Multi-window** — open multiple windows within the same app
- **Multi-profile** — auto-detects `~/.claude*` directories for users with multiple Claude accounts
- **20+ built-in themes** with custom theme support
- **Configurable defaults** — optional `--dangerously-skip-permissions` for new sessions

## Requirements

- macOS (Apple Silicon or Intel)
- [Claude Code](https://claude.ai/code) installed

## Installation

### Direct download

Download the latest `.dmg` from the [Releases](https://github.com/JeffreyWardman/claude-manager/releases) page, open it, and drag **claude-manager** to `/Applications`.

## Usage

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+P` | Settings |
| `Cmd+N` | New window |
| `Cmd+Shift+N` | New session (path picker) |
| `Cmd+M` | Minimize window |
| `Cmd+W` | Archive session |
| `Cmd+Delete` | Delete active group, or archive selected tab |
| `Cmd+B` | Toggle sidebar |
| `Ctrl+Tab` | Next group |
| `Ctrl+Shift+Tab` | Previous group |
| `Up/Down` | Navigate sessions |
| `Enter` | Rename selected session |
| `Cmd+1-9` | Jump to group by number |

### Sidebar search

The search bar at the top of the sidebar filters groups and sessions. Type to filter by name, path, or session ID.

The sidebar header has filter and sort controls:

| Button | Cycles through |
|--------|---------------|
| **ALL/LIVE/OFF** | Status filter — all, active only, offline only |
| **Sort/Group dropdown** | Sort by newest first or alphabetical; group by status or location |

Scope your search with prefixes:

| Prefix | Scope |
|--------|-------|
| (none) | Search everything |
| `@group:` | Groups only |
| `@tab:` | Sessions/tabs only |
| `@folder:` | Folder/path only |

Examples: `@group:deploy`, `@tab:main`, `@folder:repos/frontend`, `api`.

Folder search accepts full paths, `~/` paths, or bare paths (assumes `~/` prefix).

### Activity indicators

Each session shows a status dot:

| Colour | Meaning |
|--------|---------|
| Amber (pulsing) | Claude is computing |
| Blue (glow) | Claude finished — unread |
| Green (glow) | Waiting for input |
| Dim green | Active (no recent activity) |
| Grey | Offline |

Unread sessions are marked as read when you click the pane, click the session in the sidebar, or start typing in it.

Optionally play a sound when a session completes — enable in Settings > Preferences > Completion Sound and choose an audio file.

### Ignore patterns

Hide sessions from the sidebar by adding ignore patterns in Settings > Preferences > Ignore Patterns. One pattern per line, matched against session name and path (relative to home directory). Supports globs (`*`, `**`, `?`).

- `repos/tmp-*` — hide sessions in directories starting with tmp-
- `**/scratch` — hide any session with scratch in the path
- `!scratch/important` — un-ignore a specific match
- `*.env*` — hide sessions with .env in the name
- `!*.env.example` — except .env.example
- `# comment` — lines starting with # are ignored

### Session actions

Right-click a session in the sidebar to access these actions:

| Action | Effect |
|--------|--------|
| **Archive** | Hides the session from the sidebar. The conversation file is preserved on disk and can be resumed by Claude Code directly. |
| **Delete** | Permanently removes the session's conversation file (`~/.claude/projects/*/{id}.jsonl`) and its metadata. This cannot be undone. |

### Groups and tiling

- Drag sessions onto a group header to add them. If the group is full, it auto-expands to the next enabled tiling layout.
- Change tiling layouts from the group header in the sidebar.
- Enable/disable layouts in Settings > Preferences > Tiling Layouts.

### Multi-window

`Cmd+N` opens a new window within the same app process. Each window has independent groups and focused sessions but shares the same session pool. Session locking prevents two windows from resuming the same Claude session simultaneously. New windows inherit the active profile from the window that created them.

### Multi-profile

If you use multiple Claude Code accounts via `CLAUDE_CONFIG_DIR` (e.g. `~/.claude` for personal, `~/.claude-work` for work), the app auto-detects all `~/.claude*` directories on startup.

When 2+ profiles are detected:
- A profile pill appears in the sidebar footer — click to switch profiles
- Each window shows sessions from one profile at a time
- Settings > Preferences shows a Profiles section to rename or hide profiles

Single-account users see no UI changes.

Profile configuration is stored in `~/.config/claude-manager/profiles.json`.

## Custom themes

Drop `.json` files into `~/.config/claude-manager/themes/`. They are auto-detected on launch and appear alongside built-in themes in Settings.

Each file must match this structure:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "bg": {
    "sidebar": "#1a1b26",
    "main": "#1a1b26"
  },
  "border": "#292e42",
  "text": {
    "primary": "#c0caf5",
    "secondary": "#a9b1d6",
    "muted": "#565f89",
    "veryMuted": "#3b4261"
  },
  "item": {
    "selected": "rgba(192,202,245,0.1)",
    "hover": "rgba(192,202,245,0.05)"
  },
  "accent": "#7aa2f7",
  "terminal": {
    "background": "#1a1b26",
    "foreground": "#c0caf5",
    "cursor": "#c0caf5",
    "cursorAccent": "#1a1b26",
    "selectionBackground": "rgba(192,202,245,0.15)",
    "black": "#15161e",
    "red": "#f7768e",
    "green": "#9ece6a",
    "yellow": "#e0af68",
    "blue": "#7aa2f7",
    "magenta": "#bb9af7",
    "cyan": "#7dcfff",
    "white": "#a9b1d6",
    "brightBlack": "#414868",
    "brightRed": "#f7768e",
    "brightGreen": "#9ece6a",
    "brightYellow": "#e0af68",
    "brightBlue": "#7aa2f7",
    "brightMagenta": "#bb9af7",
    "brightCyan": "#7dcfff",
    "brightWhite": "#c0caf5"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (used internally) |
| `name` | Display name in the theme picker |
| `bg` | Sidebar and main pane background colours |
| `border` | Border colour between panes and UI elements |
| `text` | Text colours at four intensity levels |
| `item` | Sidebar item selection and hover backgrounds |
| `accent` | Accent colour for active indicators and highlights |
| `terminal` | [xterm.js ITheme](https://xtermjs.org/docs/api/terminal/interfaces/itheme/) — all 16 ANSI colour slots plus background, foreground, cursor, and selection. Names like `red` and `brightCyan` are slot names, not literal colours — set them to whatever fits your palette |

## Building from source

| Tool | Install |
|------|---------|
| Rust (stable) | `curl https://sh.rustup.rs -sSf \| sh` |
| Bun | `curl -fsSL https://bun.sh/install \| bash` |
| Xcode CLI Tools | `xcode-select --install` |

```sh
git clone https://github.com/JeffreyWardman/claude-manager.git
cd claude-manager
bun install
bun run start          # dev mode with hot reload
bunx tauri build       # production build → src-tauri/target/release/bundle/
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
