# Claude Manager

The session manager for Claude Code. Manage multiple sessions in one window with live status, named groups, and persistent workspaces.

## Why Claude Manager?

**Organise by role.** Name sessions "planner", "implementer", "reviewer" and group them together. Drag to rearrange, switch between project contexts in one click.

**See everything at once.** View 2, 4, or 6 Claude sessions in a tiling grid. No more cycling through terminal tabs to check which one finished.

**Manage context, not windows.** When you're running a planner in one pane and an implementer in another, you need to see both and know which is which. Groups let you define these roles spatially and keep related sessions together.

**Know what's happening.** Live activity indicators show which sessions are computing, done, or waiting. Optional sound alerts when a session completes.

**Never miss a completion.** When subagents finish work that takes minutes, the unread indicator and optional alert ensure you notice immediately — no more polling terminal tabs to check if they're done.

**Find and resume anything.** Every session from every repo, active or inactive, in one place. Search, filter, and resume old sessions with ease.

**Pick up where you left off.** Groups and layouts persist across restarts. Reopen the app and your workspace is exactly how you left it.

**Multiple Claude profiles.** Run personal, work, and local LLM accounts side by side. Claude Manager auto-detects `~/.claude*` directories and lets you switch profiles instantly. See the [profile setup guide](docs/guides/profile-setup.md) for setting up multiple Anthropic accounts or connecting a local model.

**Your terminal, your way.** 20+ built-in themes, custom theme support, configurable layouts, and full keyboard-driven workflow.

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=JeffreyWardman/claude-manager&type=date&legend=top-left)](https://www.star-history.com/?repos=JeffreyWardman%2Fclaude-manager&type=date&legend=top-left)

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
- **Configurable defaults** — optional `--dangerously-skip-permissions` for new sessions, customisable default shell

## Requirements

- macOS, Linux, or Windows
- [Claude Code](https://claude.ai/code) installed

## Installation

For direct downloads and building from source, see [INSTALLATION.md](INSTALLATION.md).

### Homebrew (macOS)

```sh
brew tap JeffreyWardman/tap
brew install --cask claude-manager
```

### Shell script (macOS / Linux)

```sh
curl -fsSL https://raw.githubusercontent.com/JeffreyWardman/claude-manager/main/install.sh | sh
```

On macOS and Linux, both install methods also create `claude-manager` and `cmanager` CLI commands so you can launch from the terminal.

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

### Default shell

The Terminal tab defaults to `/bin/zsh` on macOS, `/bin/bash` on Linux, and `powershell` on Windows. Change it in Settings > Preferences > General > Default Shell (e.g. `/usr/bin/fish`). Leave blank for the platform default.

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

This also works with local LLM setups — if you have a profile configured to use a local model, you can switch to it from the sidebar without restarting.

When 2+ profiles are detected:
- A profile pill appears in the sidebar footer — click to switch profiles
- Each window shows sessions from one profile at a time
- Settings > Preferences shows a Profiles section to rename or hide profiles

Single-account users see no UI changes.

Profile configuration is stored in `~/.config/claude-manager/profiles.json`.

#### Local LLM setup

You can use Claude Code with a local LLM by creating a dedicated profile directory and pointing it at your local server.

**1. Start a local LLM server** that exposes an Anthropic-compatible API — [LM Studio](https://lmstudio.ai) (0.4.1+) has native support; others like Ollama or vLLM can work via a compatibility layer.

**2. Create the profile directory and configure it:**

```sh
mkdir -p ~/.claude-local
```

Create `~/.claude-local/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:1234",
    "ANTHROPIC_API_KEY": "local"
  }
}
```

Adjust the port to match your server (LM Studio defaults to `1234`, Ollama to `11434`).

**3. Start Claude Code with the profile** to initialise the directory and create sessions:

```sh
CLAUDE_CONFIG_DIR=~/.claude-local claude /path/to/your/repo
```

**4. Claude Manager auto-detects `~/.claude-local`** on next launch and shows it as a switchable profile in the sidebar footer.

> Your local server must expose the Anthropic Messages API (`/v1/messages`). LM Studio's built-in Anthropic compatibility mode is the easiest starting point.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
