# Installation

## Direct download

Download the latest build for your platform from the [Releases](https://github.com/JeffreyWardman/claude-manager/releases) page:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` — open and drag to `/Applications` |
| Linux | `.deb`, `.rpm`, or `.AppImage` |
| Windows | `.msi` or `.exe` |

## Building from source

## Prerequisites

| Tool | Install |
|------|---------|
| [Rust](https://www.rust-lang.org/tools/install) (stable) | `curl https://sh.rustup.rs -sSf \| sh` |
| [Bun](https://bun.sh/) | `curl -fsSL https://bun.sh/install \| bash` |

### macOS

```sh
xcode-select --install
```

### Linux (Debian/Ubuntu)

```sh
sudo apt update
sudo apt install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev libsoup-3.0-dev libappindicator3-dev \
  librsvg2-dev patchelf
```

### Linux (Fedora)

```sh
sudo dnf install gtk3-devel webkit2gtk4.1-devel libsoup3-devel \
  libappindicator-gtk3-devel librsvg2-devel patchelf
```

### Linux (Arch)

```sh
sudo pacman -S webkit2gtk-4.1 libsoup3 libappindicator-gtk3 librsvg patchelf
```

### Windows

Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

## Build and run

```sh
git clone https://github.com/JeffreyWardman/claude-manager.git
cd claude-manager
bun install
bun run start          # dev mode with hot reload
bunx tauri build       # production build -> src-tauri/target/release/bundle/
```
