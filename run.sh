#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

action="run"
no_browser=0
for arg in "$@"; do
  case "$arg" in
    run|doctor|repair|docker|stop|logs) action="$arg" ;;
    --no-browser) no_browser=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

uv_version="0.12.5"
url="http://127.0.0.1:8765"

retry() {
  local label=$1; shift
  local attempt
  for attempt in 1 2 3; do
    "$@" && return 0
    [ "$attempt" -eq 3 ] && { echo "$label failed after 3 attempts" >&2; return 1; }
    sleep $((1 << (attempt - 1)))
  done
}

find_uv() {
  command -v uv 2>/dev/null || {
    [ -x "$HOME/.local/bin/uv" ] && printf '%s\n' "$HOME/.local/bin/uv" && return 0
    [ -x "$HOME/.cargo/bin/uv" ] && printf '%s\n' "$HOME/.cargo/bin/uv" && return 0
    return 1
  }
}

install_uv() {
  local installer
  installer="$(mktemp)"
  if command -v curl >/dev/null 2>&1; then
    retry "uv download" curl -fsSL "https://astral.sh/uv/${uv_version}/install.sh" -o "$installer"
  elif command -v wget >/dev/null 2>&1; then
    retry "uv download" wget -qO "$installer" "https://astral.sh/uv/${uv_version}/install.sh"
  else
    echo "curl or wget is required to bootstrap uv" >&2; rm -f "$installer"; return 1
  fi
  sh "$installer"
  rm -f "$installer"
  find_uv
}

wait_ready() {
  local health=$1
  for _ in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "$health" >/dev/null 2>&1; then return 0; fi
    if command -v wget >/dev/null 2>&1 && wget -q --timeout=2 -O /dev/null "$health" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  return 1
}

open_url() {
  [ "$no_browser" -eq 1 ] && return 0
  command -v open >/dev/null 2>&1 && { open "$1" >/dev/null 2>&1 || true; return; }
  command -v xdg-open >/dev/null 2>&1 && { xdg-open "$1" >/dev/null 2>&1 || true; return; }
  command -v gio >/dev/null 2>&1 && gio open "$1" >/dev/null 2>&1 || true
}

case "$action" in
  docker|stop|logs)
    command -v docker >/dev/null 2>&1 || { echo "Docker is not installed." >&2; exit 1; }
    docker info >/dev/null 2>&1 || { echo "Docker is installed but its engine is not running." >&2; exit 1; }
    [ "$action" = stop ] && exec docker compose down
    [ "$action" = logs ] && exec docker compose logs --follow
    docker compose up --detach --build
    wait_ready "$url/api/health" || { docker compose logs; echo "Agentarium did not become healthy." >&2; exit 1; }
    echo "Agentarium is ready at $url"
    open_url "$url"
    exit 0 ;;
esac

uv="$(find_uv || true)"
if [ "$action" = doctor ]; then
  [ -n "$uv" ] || { echo "uv is missing. Run ./run.sh once." >&2; exit 1; }
  "$uv" run --frozen --no-sync agentarium --help >/dev/null
  [ -f backend/agentarium/static/index.html ] || { echo "The prebuilt UI is missing." >&2; exit 1; }
  echo "Agentarium native environment is ready."
  exit 0
fi
[ -n "$uv" ] || uv="$(install_uv)"

sync_args=(sync --frozen --no-dev)
[ "$action" = repair ] && sync_args+=(--reinstall)
retry "dependency synchronization" "$uv" "${sync_args[@]}"

if [ ! -f backend/agentarium/static/index.html ]; then
  command -v npm >/dev/null 2>&1 || { echo "The prebuilt UI is missing and Node/npm is unavailable." >&2; exit 1; }
  (cd frontend && npm ci && npm run build)
fi

serve_args=(run --frozen --no-sync agentarium serve --no-reload)
[ "$no_browser" -eq 0 ] && serve_args+=(--open)
exec "$uv" "${serve_args[@]}"
