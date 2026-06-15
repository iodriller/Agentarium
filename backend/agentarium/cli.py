import argparse
import socket
import sys
import threading
import time
import urllib.request

import uvicorn


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentarium")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="Start the Agentarium server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    # Reload is OFF by default: the file-watcher can tear down live runs when
    # artifacts are written under runs/. Developers opt in with --reload.
    serve.add_argument("--reload", action="store_true", default=False)
    serve.add_argument("--no-reload", dest="reload", action="store_false")
    serve.add_argument(
        "--open",
        dest="open_browser",
        action="store_true",
        help="Open the app in your browser once the server is ready",
    )
    return parser


def _port_in_use(host: str, port: int) -> bool:
    """True if ``host:port`` is already accepting connections."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        try:
            return sock.connect_ex((host if host != "0.0.0.0" else "127.0.0.1", port)) == 0
        except OSError:
            return False


def _open_when_ready(url: str, health_url: str) -> None:
    """Open ``url`` only once the server answers /api/health (max ~20s)."""

    def _wait_and_open() -> None:
        import webbrowser

        deadline = time.monotonic() + 20.0
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(health_url, timeout=1.0) as resp:
                    if resp.status == 200:
                        webbrowser.open(url)
                        return
            except Exception:  # noqa: BLE001 - server not up yet; keep polling
                time.sleep(0.4)
        # Fallback: open anyway so the user isn't left without a window.
        webbrowser.open(url)

    threading.Thread(target=_wait_and_open, daemon=True).start()


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "serve" or args.command is None:
        host = getattr(args, "host", "127.0.0.1")
        port = getattr(args, "port", 8765)
        reload = getattr(args, "reload", False)

        if _port_in_use(host, port):
            print(
                f"\n  Port {port} is already in use — is Agentarium already running?\n"
                f"  Open http://localhost:{port} in your browser, or stop the other\n"
                f"  process and try again (or pass a different --port).\n",
                file=sys.stderr,
            )
            raise SystemExit(1)

        if getattr(args, "open_browser", False):
            shown = "localhost" if host in ("127.0.0.1", "0.0.0.0") else host
            _open_when_ready(
                f"http://{shown}:{port}", f"http://127.0.0.1:{port}/api/health"
            )
        uvicorn.run("agentarium.app:app", host=host, port=port, reload=reload)
    else:
        parser.print_help()
