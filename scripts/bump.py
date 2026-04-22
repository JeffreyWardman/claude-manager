#!/usr/bin/env python3
"""Determine whether a version bump is needed and perform it if so.

Outputs (via GITHUB_OUTPUT):
  bumped       — "true" if a release should proceed
  version      — the version string (e.g. "0.2.0")
  pre_bumped   — "true" if the version was already bumped in the repo
"""

import os
import subprocess
import sys
import tomllib


def run(cmd: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, check=check)


def output(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            f.write(f"{key}={value}\n")
    print(f"  {key}={value}")


def main() -> None:
    with open(".cz.toml", "rb") as f:
        current = tomllib.load(f)["tool"]["commitizen"]["version"]

    result = run("git describe --tags --abbrev=0", check=False)
    latest_tag = result.stdout.strip() if result.returncode == 0 else ""
    latest_version = latest_tag.lstrip("v") if latest_tag else ""

    # Case 1: No tags exist yet
    if not latest_tag:
        if current != "0.0.0":
            print(f"First release: {current} (pre-bumped, no existing tags)")
            output("bumped", "true")
            output("version", current)
            output("pre_bumped", "true")
        else:
            run("cz bump --yes --increment MINOR")
            version = run("cz version --project").stdout.strip()
            print(f"First release: {version}")
            output("bumped", "true")
            output("version", version)
            output("pre_bumped", "false")
        return

    # Case 2: Version in .cz.toml differs from latest tag (pre-bumped)
    if current != latest_version:
        print(f"Version already bumped to {current} (latest tag: {latest_tag})")
        output("bumped", "true")
        output("version", current)
        output("pre_bumped", "true")
        return

    # Case 3: Try commitizen bump
    dry_run = run("cz bump --yes --dry-run", check=False)
    if dry_run.returncode == 0:
        run("cz bump --yes")
        version = run("cz version --project").stdout.strip()
        output("bumped", "true")
        output("version", version)
        output("pre_bumped", "false")
    else:
        print("No version bump needed")
        output("bumped", "false")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
