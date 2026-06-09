from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agentarium import __version__

app = FastAPI(title="Agentarium", version=__version__)

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
