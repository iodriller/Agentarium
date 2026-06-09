import uvicorn


def main() -> None:
    uvicorn.run("agentarium.app:app", host="127.0.0.1", port=8765, reload=True)
