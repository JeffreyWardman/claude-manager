#!/bin/sh
set -e

REPO="JeffreyWardman/claude-manager"
APP_NAME="ClaudeManager"
PKG_NAME="claude-manager"

# Detect platform and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
    arm64|aarch64) ARCH_TAG="aarch64" ;;
    x86_64|amd64)  ARCH_TAG="x64" ;;
    *)              echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Fetch latest release tag
echo "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
if [ -z "$TAG" ]; then
    echo "Failed to fetch latest release tag"
    exit 1
fi
VERSION="${TAG#v}"
echo "Latest version: $VERSION"

BASE_URL="https://github.com/$REPO/releases/download/$TAG"

if [ "$PLATFORM" = "macos" ]; then
    DMG="${APP_NAME}_${VERSION}_${ARCH_TAG}.dmg"
    URL="$BASE_URL/$DMG"
    TMPDIR=$(mktemp -d)
    DMG_PATH="$TMPDIR/$DMG"

    echo "Downloading $DMG..."
    curl -fSL -o "$DMG_PATH" "$URL"

    echo "Installing to /Applications..."
    MOUNT=$(hdiutil attach "$DMG_PATH" -nobrowse | awk -F'\t' '{print $NF}' | tail -1 | xargs)
    if [ -d "/Applications/$APP_NAME.app" ]; then
        rm -rf "/Applications/$APP_NAME.app"
    fi
    cp -R "$MOUNT/$APP_NAME.app" /Applications/
    hdiutil detach "$MOUNT" -quiet
    rm -rf "$TMPDIR"

    # Create CLI symlinks
    mkdir -p /usr/local/bin
    ln -sf "/Applications/$APP_NAME.app/Contents/MacOS/$APP_NAME" /usr/local/bin/claude-manager
    ln -sf "/Applications/$APP_NAME.app/Contents/MacOS/$APP_NAME" /usr/local/bin/cmanager

    echo "Installed $APP_NAME $VERSION to /Applications/$APP_NAME.app"
    echo "CLI commands available: claude-manager, cmanager"

elif [ "$PLATFORM" = "linux" ]; then
    if [ "$ARCH_TAG" != "x64" ]; then
        echo "Linux builds are only available for x86_64"
        exit 1
    fi

    # Prefer .deb on Debian/Ubuntu, fall back to AppImage
    if command -v dpkg >/dev/null 2>&1; then
        DEB="${PKG_NAME}_${VERSION}_amd64.deb"
        URL="$BASE_URL/$DEB"
        TMPDIR=$(mktemp -d)
        DEB_PATH="$TMPDIR/$DEB"

        echo "Downloading $DEB..."
        curl -fSL -o "$DEB_PATH" "$URL"

        echo "Installing via dpkg..."
        sudo dpkg -i "$DEB_PATH" || sudo apt-get install -f -y
        rm -rf "$TMPDIR"

        sudo ln -sf /usr/bin/claude-manager /usr/bin/cmanager
        echo "Installed $APP_NAME $VERSION"
        echo "CLI commands available: claude-manager, cmanager"
    else
        APPIMAGE="${PKG_NAME}_${VERSION}_amd64.AppImage"
        URL="$BASE_URL/$APPIMAGE"
        INSTALL_DIR="${HOME}/.local/bin"
        mkdir -p "$INSTALL_DIR"

        echo "Downloading $APPIMAGE..."
        curl -fSL -o "$INSTALL_DIR/$PKG_NAME" "$URL"
        chmod +x "$INSTALL_DIR/$PKG_NAME"

        ln -sf "$INSTALL_DIR/$PKG_NAME" "$INSTALL_DIR/cmanager"
        echo "Installed $APP_NAME $VERSION to $INSTALL_DIR/$PKG_NAME"
        echo "CLI commands available: claude-manager, cmanager"
        echo "Make sure $INSTALL_DIR is in your PATH"
    fi
fi