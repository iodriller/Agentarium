import argparse
import threading
import webbrowser

import uvicorn


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentarium")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="Start the Agentarium server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--reload", action="store_true", default=True)
    serve.add_argument("--no-reload", dest="reload", action="store_false")
    serve.add_argument(
        "--open",
        dest="open_browser",
        action="store_true",
        help="Open the app in your browser once the server starts",
    )
    return parser


def _maybe_open_browser(url: str) -> None:
    """Open ``url`` shortly after start so the server is accepting connections."""
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "serve" or args.command is None:
        host = getattr(args, "host", "127.0.0.1")
        port = getattr(args, "port", 8765)
        reload = getattr(args, "reload", True)
        if getattr(args, "open_browser", False):
            shown = "localhost" if host in ("127.0.0.1", "0.0.0.0") else host
            _maybe_open_browser(f"http://{shown}:{port}")
        uvicorn.run("agentarium.app:app", host=host, port=port, reload=reload)
    else:
        parser.print_help()
