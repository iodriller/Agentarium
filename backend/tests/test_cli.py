"""CLI argument parsing for `agentarium serve` (Step 25.5 — easy launch).

We test the parser, not uvicorn: the launcher passes `--no-reload --open`, so
those must parse correctly, and the defaults must stay backwards-compatible.
"""

from agentarium.cli import _build_parser


def test_serve_launcher_flags():
    args = _build_parser().parse_args(["serve", "--no-reload", "--open"])
    assert args.command == "serve"
    assert args.reload is False
    assert args.open_browser is True
    assert args.host == "127.0.0.1"
    assert args.port == 8765


def test_serve_defaults():
    args = _build_parser().parse_args(["serve"])
    assert args.reload is True
    assert args.open_browser is False


def test_serve_custom_host_port():
    args = _build_parser().parse_args(["serve", "--host", "0.0.0.0", "--port", "9000"])
    assert args.host == "0.0.0.0"
    assert args.port == 9000
