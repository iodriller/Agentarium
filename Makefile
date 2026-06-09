.PHONY: install serve test lint fmt web

install:
	uv sync --all-groups

serve:
	uv run agentarium

test:
	uv run pytest

lint:
	uv run ruff check .

fmt:
	uv run ruff format .

web:
	cd frontend && npm run dev
