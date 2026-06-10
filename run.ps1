# Agentarium one-command launcher (Windows PowerShell).
#
#   ./run.ps1
#
# It installs everything it needs and opens the app in your browser. No manual
# virtualenv, no "install this then that". You do NOT need Node — a prebuilt web
# UI ships with the repo.
#
# If Windows blocks the script, run it once as:
#   powershell -ExecutionPolicy Bypass -File .\run.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "> Agentarium launcher"

# 1. Ensure uv is available (it manages Python itself).
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host "  - Installing uv (one-time, no admin needed)..."
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}

# 2. Install Python + dependencies.
Write-Host "  - Installing dependencies..."
uv sync --all-groups

# 3. Build the web UI only if it is missing AND Node is available (prebuilt
#    bundle ships in the repo, so most people skip this).
if (-not (Test-Path backend/agentarium/static/index.html)) {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Host "  - Building the web UI..."
    Push-Location frontend; npm install; npm run build; Pop-Location
  } else {
    Write-Host "  x No prebuilt UI found and Node/npm isn't installed."
    Write-Host "    Install Node 18+ from https://nodejs.org and re-run, or restore the"
    Write-Host "    committed bundle with: git checkout -- backend/agentarium/static"
    exit 1
  }
}

# 4. Launch (browser opens automatically once the server is up).
Write-Host "  - Starting Agentarium -> http://localhost:8765"
uv run agentarium serve --no-reload --open
