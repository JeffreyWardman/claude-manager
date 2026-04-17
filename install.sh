#!/bin/sh
set -e

REPO="JeffreyWardman/claude-manager"
APP_NAME="claude-manager"

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
    MOUNT=$(hdiutil attach "$DMG_PATH" -nobrowse -quiet | tail -1 | awk '{print $3}')
    if [ -d "/Applications/$APP_NAME.app" ]; then
        rm -rf "/Applications/$APP_NAME.app"
    fi
    cp -R "$MOUNT/$APP_NAME.app" /Applications/
    hdiutil detach "$MOUNT" -quiet
    rm -rf "$TMPDIR"

    echo "Installed $APP_NAME $VERSION to /Applications/$APP_NAME.app"

elif [ "$PLATFORM" = "linux" ]; then
    if [ "$ARCH_TAG" != "x64" ]; then
        echo "Linux builds are only available for x86_64"
        exit 1
    fi

    # Prefer .deb on Debian/Ubuntu, fall back to AppImage
    if command -v dpkg >/dev/null 2>&1; then
        DEB="${APP_NAME}_${VERSION}_amd64.deb"
        URL="$BASE_URL/$DEB"
        TMPDIR=$(mktemp -d)
        DEB_PATH="$TMPDIR/$DEB"

        echo "Downloading $DEB..."
        curl -fSL -o "$DEB_PATH" "$URL"

        echo "Installing via dpkg..."
        sudo dpkg -i "$DEB_PATH" || sudo apt-get install -f -y
        rm -rf "$TMPDIR"

        echo "Installed $APP_NAME $VERSION"
    else
        APPIMAGE="${APP_NAME}_${VERSION}_amd64.AppImage"
        URL="$BASE_URL/$APPIMAGE"
        INSTALL_DIR="${HOME}/.local/bin"
        mkdir -p "$INSTALL_DIR"

        echo "Downloading $APPIMAGE..."
        curl -fSL -o "$INSTALL_DIR/$APP_NAME" "$URL"
        chmod +x "$INSTALL_DIR/$APP_NAME"

        echo "Installed $APP_NAME $VERSION to $INSTALL_DIR/$APP_NAME"
        echo "Make sure $INSTALL_DIR is in your PATH"
    fi
fi