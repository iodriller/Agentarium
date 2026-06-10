from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from agentarium.services.export_service import (
    export_design,
    export_report,
    export_scorecard,
    export_trace,
)

router = APIRouter(prefix="/api/exports", tags=["exports"])


def _attachment(content: str, media_type: str, filename: str) -> PlainTextResponse:
    return PlainTextResponse(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/design")
async def get_design_export(
    run_id: str, format: str = Query("yaml", pattern="^(yaml|json)$")
) -> PlainTextResponse:
    content = export_design(run_id, format)
    if content is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    media = "application/json" if format == "json" else "application/x-yaml"
    return _attachment(content, media, f"design_{run_id}.{format}")


@router.get("/{run_id}/trace")
async def get_trace_export(
    run_id: str, format: str = Query("jsonl", pattern="^(jsonl|json)$")
) -> PlainTextResponse:
    content = export_trace(run_id, format)
    if content is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    media = "application/json" if format == "json" else "application/x-ndjson"
    return _attachment(content, media, f"trace_{run_id}.{format}")


@router.get("/{run_id}/scorecard")
async def get_scorecard_export(run_id: str) -> PlainTextResponse:
    content = export_scorecard(run_id)
    if content is None:
        raise HTTPException(status_code=404, detail=f"Score not found: {run_id}")
    return _attachment(content, "application/json", f"scorecard_{run_id}.json")


@router.get("/{run_id}/report")
async def get_report_export(run_id: str) -> PlainTextResponse:
    content = export_report(run_id)
    if content is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return _attachment(content, "text/markdown", f"report_{run_id}.md")
