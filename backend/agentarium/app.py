import pathlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from agentarium import __version__
from agentarium.api.routes_setup import router as setup_router
from agentarium.api.routes_tools import router as tools_router

app = FastAPI(title="Agentarium", version=__version__)

app.include_router(setup_router)
app.include_router(tools_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "version": __version__}


# Serve built frontend when it exists (production)
_static = pathlib.Path(__file__).parent / "static"
if _static.is_dir():
    # Mount assets (hashed filenames) as static files
    _assets = _static / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    # SPA fallback: any non-API path returns index.html for React Router
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        return FileResponse(str(_static / "index.html"))
