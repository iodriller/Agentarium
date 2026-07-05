"""Opt-in browser screenshots for the Setup and Studio surfaces.

Normal pytest runs skip this module. CI enables it with
AGENTARIUM_VISUAL_TESTS=1 and uploads the generated PNGs as artifacts.
"""
from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request

import pytest
from playwright.sync_api import Page, expect, sync_playwright

pytestmark = pytest.mark.skipif(
    os.environ.get("AGENTARIUM_VISUAL_TESTS") != "1",
    reason="set AGENTARIUM_VISUAL_TESTS=1 to run browser visual checks",
)

PREVIEW_IMAGES = {
    "bridge-builder": "Bridge Builder",
    "crawl-challenge": "Crawl Challenge",
    "sorter": "Sorter",
    "tiny-city-preview": "Tiny City Preview",
    "custom-scenario": "Custom Scenario",
}


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="module")
def artifact_dir() -> pathlib.Path:
    path = pathlib.Path(os.environ.get("AGENTARIUM_VISUAL_ARTIFACT_DIR", "visual-artifacts"))
    path.mkdir(parents=True, exist_ok=True)
    return path


@pytest.fixture(scope="module")
def live_server() -> str:
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    backend = pathlib.Path(__file__).resolve().parents[1]
    env["PYTHONPATH"] = str(backend) + os.pathsep + env.get("PYTHONPATH", "")
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "agentarium.app:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=pathlib.Path(__file__).resolve().parents[2],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("visual test server exited before startup")
        try:
            with urllib.request.urlopen(f"{base}/api/health", timeout=1) as resp:
                if resp.status == 200:
                    break
        except Exception:  # noqa: BLE001 - server is still booting
            time.sleep(0.25)
    else:
        proc.terminate()
        raise RuntimeError("visual test server did not answer /api/health")

    yield base

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


@pytest.fixture()
def page(live_server: str) -> Page:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15_000)
        yield page
        browser.close()


def _assert_png(path: pathlib.Path) -> None:
    assert path.is_file()
    assert path.stat().st_size > 500


def test_setup_and_challenge_previews_have_visual_artifacts(
    page: Page,
    live_server: str,
    artifact_dir: pathlib.Path,
) -> None:
    page.goto(f"{live_server}/setup", wait_until="networkidle")
    expect(page.get_by_text("Simulation Setup")).to_be_visible()

    setup_path = artifact_dir / "setup-screen.png"
    page.screenshot(path=str(setup_path), full_page=True)
    _assert_png(setup_path)

    for image_name, label in PREVIEW_IMAGES.items():
        card = page.get_by_text(label).first
        expect(card).to_be_visible()
        img = page.locator(f'img[src$="{image_name}.png"]').first
        expect(img).to_be_visible()
        path = artifact_dir / f"preview-{image_name}.png"
        img.screenshot(path=str(path))
        _assert_png(path)


def test_studio_replay_has_visual_artifact(
    page: Page,
    live_server: str,
    artifact_dir: pathlib.Path,
) -> None:
    request = urllib.request.Request(
        f"{live_server}/api/runs",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as resp:
        run_id = json.loads(resp.read().decode("utf-8"))["run_id"]

    page.goto(f"{live_server}/studio/{run_id}", wait_until="networkidle")
    expect(page.get_by_text("Replay Timeline")).to_be_visible()
    canvas = page.locator("canvas").first
    expect(canvas).to_be_visible()
    page.wait_for_timeout(800)

    studio_path = artifact_dir / "studio-replay.png"
    page.screenshot(path=str(studio_path), full_page=True)
    _assert_png(studio_path)
