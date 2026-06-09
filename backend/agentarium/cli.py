import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="agentarium")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="Start the Agentarium server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--reload", action="store_true", default=True)
    serve.add_argument("--no-reload", dest="reload", action="store_false")

    args = parser.parse_args()

    if args.command == "serve" or args.command is None:
        host = getattr(args, "host", "127.0.0.1")
        port = getattr(args, "port", 8765)
        reload = getattr(args, "reload", True)
        uvicorn.run("agentarium.app:app", host=host, port=port, reload=reload)
    else:
        parser.print_help()
