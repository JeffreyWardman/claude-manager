# Getting Started: Multiple Profiles & Local LLMs

Claude Manager auto-detects all `~/.claude*` directories and shows them as switchable profiles. This guide covers setting up multiple Anthropic accounts and local LLM profiles.

## Contents

- [Multiple Anthropic Accounts](#multiple-anthropic-accounts)
- [Local LLM Profile](#local-llm-profile)
- [Using with Claude Manager](#using-with-claude-manager)

## Multiple Anthropic Accounts

Use `CLAUDE_CONFIG_DIR` to create separate profiles, each with its own login, sessions, and settings.

### 1. Create config directories

```sh
mkdir -p ~/.claude-personal
mkdir -p ~/.claude-work
```

### 2. Add shell aliases

Add to your `~/.zshrc` (or `~/.bashrc`):

```sh
alias claude-personal='CLAUDE_CONFIG_DIR=~/.claude-personal claude'
alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'
```

Then reload: `source ~/.zshrc`

### 3. Log in to each account

```sh
claude-personal
# Inside Claude Code, run: /login
# Complete the OAuth flow in your browser
# Verify with: /status

claude-work
# Repeat for your work account
```

Each directory stores its own credentials, sessions, and settings independently. Claude Manager will detect both and let you switch between them from the sidebar profile picker.

> **Note:** Shell aliases are required for using profiles directly in a terminal. Without `CLAUDE_CONFIG_DIR`, Claude Code writes sessions to `~/.claude` regardless of other env vars. The aliases are not needed when launching sessions from within Claude Manager — it sets `CLAUDE_CONFIG_DIR` automatically.

### Reference

Based on [Setting Up Multiple Claude Code Accounts](https://medium.com/@buwanekasumanasekara/setting-up-multiple-claude-code-accounts-on-your-local-machine-f8769a36d1b1) by Buwaneka Sumanasekara.

---

## Local LLM Profile

Run Claude Code against a local model (e.g. via llama.cpp) instead of Anthropic's API.

### 1. Create a profile directory

```sh
mkdir -p ~/.claude-local
```

### 2. Set up a local model server

Install [llama.cpp](https://github.com/ggml-org/llama.cpp) and download a model. For example, using Unsloth's Qwen3:

```sh
# Install llama.cpp (adjust for your platform)
git clone https://github.com/ggml-org/llama.cpp
cmake llama.cpp -B llama.cpp/build -DBUILD_SHARED_LIBS=OFF
cmake --build llama.cpp/build --config Release -j --target llama-server

# Download a model
pip install huggingface_hub hf_transfer
huggingface-cli download unsloth/Qwen3.5-35B-A3B-GGUF \
  --local-dir models/Qwen3.5-35B-A3B-GGUF \
  --include "*UD-Q4_K_XL*"
```

### 3. Start the server

```sh
./llama.cpp/build/bin/llama-server \
  --model models/Qwen3.5-35B-A3B-GGUF/Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf \
  --alias "unsloth/Qwen3.5-35B-A3B" \
  --port 8001 \
  --ctx-size 131072 \
  --flash-attn on
```

### 4. Configure the profile

Add a shell alias (for running `claude-local` directly in a terminal):

```sh
alias claude-local='CLAUDE_CONFIG_DIR=~/.claude-local ANTHROPIC_BASE_URL=http://localhost:8001 ANTHROPIC_API_KEY=sk-no-key-required claude'
```

`CLAUDE_CONFIG_DIR` is required so sessions go to the right profile directory. `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` tell Claude Code to use your local server.

Create `~/.claude-local/settings.json` with the same env vars (Claude Manager reads these when spawning sessions, so the alias isn't needed inside the app):

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8001",
    "ANTHROPIC_API_KEY": "sk-no-key-required",
    "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
  }
}
```

Skip the login prompt by creating `~/.claude-local/.claude.json`:

```json
{
  "hasCompletedOnboarding": true,
  "primaryApiKey": "sk-dummy-key"
}
```

### 5. Run it

```sh
claude-local --model unsloth/Qwen3.5-35B-A3B
```

Or with permissions skipped:

```sh
claude-local --model unsloth/Qwen3.5-35B-A3B --dangerously-skip-permissions
```

### Reference

Based on the [Unsloth Claude Code guide](https://unsloth.ai/docs/basics/claude-code).

---

## Using with Claude Manager

You can manage profiles in two ways:

**From the app:** Go to Settings > Preferences > Profiles. Here you can:
- **Add** a new profile (creates `~/.claude-{name}/` with onboarding skipped)
- **Remove** a profile (unlinks it from Claude Manager — the directory is preserved)
- **Rename** or **hide** profiles
- **Rescan directories** to pick up profiles created outside the app

**From the terminal:** Create `~/.claude-{name}/` directories manually and they'll be auto-detected on next rescan or app launch.

When spawning sessions, Claude Manager sets `CLAUDE_CONFIG_DIR` automatically and reads the profile's `settings.json` `env` block — any environment variables defined there (like `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`) are injected into the PTY process. No shell aliases needed when launching from Claude Manager.

> **Important:** If you also use profiles directly in a terminal (outside Claude Manager), you still need shell aliases with `CLAUDE_CONFIG_DIR` set. Without the alias, sessions go to the default `~/.claude` profile.
