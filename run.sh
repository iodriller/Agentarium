#!/usr/bin/env bash
#
# Agentarium one-command launcher (macOS / Linux).
#
#   ./run.sh
#
# It installs everything it needs and opens the app in your browser. No manual
# virtualenv, no "install this then that". You do NOT need Node — a prebuilt web
# UI ships with the repo.
#
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ Agentarium launcher"

# 1. Ensure uv is available. uv manages Python itself, so this is the only
#    prerequisite — and we install it for you if it's missing.
if ! command -v uv >/dev/null 2>&1; then
  echo "  • Installing uv (one-time, no admin needed)…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # Make uv visible on PATH for the rest of this script.
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

# Confirm uv is actually callable now (the installer may land it somewhere not
# yet on PATH for this shell). Fail with a clear next step rather than a cryptic
# "uv: command not found" on the next line.
if ! command -v uv >/dev/null 2>&1; then
  echo "  ✗ uv was installed but isn't on your PATH yet."
  echo "    Open a new terminal and re-run ./run.sh (or add ~/.local/bin to PATH)."
  exit 1
fi

# 2. Install Python + dependencies into a managed environment.
echo "  • Installing dependencies…"
uv sync --all-groups

# 3. Build the web UI only if it is missing AND Node is available. A prebuilt
#    bundle ships in the repo, so most people skip this entirely.
if [ ! -f backend/agentarium/static/index.html ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "  • Building the web UI…"
    (cd frontend && npm install && npm run build)
  else
    echo "  ✗ No prebuilt UI found and Node/npm isn't installed."
    echo "    Install Node 20.19+ or 22.12+ from https://nodejs.org and re-run, or restore the"
    echo "    committed bundle with: git checkout -- backend/agentarium/static"
    exit 1
  fi
fi

# 4. Launch. The browser opens automatically once the server is up.
echo "  • Starting Agentarium → http://localhost:8765"
exec uv run agentarium serve --no-reload --open
