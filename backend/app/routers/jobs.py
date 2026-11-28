from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import Settings
from app.dependencies import get_app_settings, get_db
from app.schemas import (
    AudioFormat,
    CreateJobResponseSchema,
    ExportFormat,
    JobDetailSchema,
    JobListItemSchema,
    JobPatchRequestSchema,
    OutputSelectionsSchema,
    RegenerateRequestSchema,
    TranscriptSearchHitSchema,
)
from app.services import jobs_service
from app.services.audio_service import prepare_extracted_audio
from app.services.export_service import export_job_file
from app.services.storage import (
    delete_stored_file,
    infer_media_content_type,
    resolve_stored_file_path,
    save_upload_file,
)
from app.services.transcription_service import get_local_runtime_capabilities

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

MEDIA_STREAM_CHUNK_SIZE = 256 * 1024  # 256 KiB


def _parse_outputs_form_field(raw_outputs: str) -> OutputSelectionsSchema:
    try:
        parsed = json.loads(raw_outputs)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid 'outputs' JSON payload.",
        ) from exc

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="'outputs' must be a JSON object.",
        )

    try:
        return OutputSelectionsSchema.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid 'outputs' configuration: {exc.errors()[0].get('msg', 'invalid fields')}",
        ) from exc


def _build_inline_content_disposition(filename: str) -> str:
    safe_utf8 = re.sub(r'[/\\<>:"|?*\x00-\x1f]', "_", Path(filename).name).strip(".") or "recording"
    ascii_fallback = re.sub(r"[^a-zA-Z0-9._-]+", "_", safe_utf8).strip("._") or "recording"
    if "." not in ascii_fallback and "." in safe_utf8:
        ascii_fallback = f"{ascii_fallback}{Path(safe_utf8).suffix}"
    encoded = quote(safe_utf8, safe="")
    return f'inline; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


def _parse_byte_range(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse HTTP Range header ('bytes=start-end', 'bytes=start-', 'bytes=-suffix')."""
    if file_size <= 0:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="Requested range is not satisfiable for an empty file.",
            headers={"Content-Range": "bytes */0"},
        )

    match = re.fullmatch(r"\s*bytes=(\d*)-(\d*)\s*", range_header)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="Invalid HTTP Range header.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    raw_start, raw_end = match.groups()
    if not raw_start and not raw_end:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="Empty HTTP Range specification.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    if not raw_start:
        # Suffix byte range: last N bytes
        suffix_len = int(raw_end)
        if suffix_len <= 0:
            raise HTTPException(
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                detail="Requested range is not satisfiable.",
                headers={"Content-Range": f"bytes */{file_size}"},
            )
        start = max(0, file_size - suffix_len)
        end = file_size - 1
        return start, end

    start = int(raw_start)
    if start >= file_size:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="Requested range start exceeds media size.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    end = int(raw_end) if raw_end else file_size - 1
    end = min(end, file_size - 1)
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="Requested range end precedes start.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    return start, end


def _iter_file_range(path: Path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with path.open("rb") as fh:
        fh.seek(start)
        while remaining > 0:
            chunk = fh.read(min(MEDIA_STREAM_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.post(
    "",
    response_model=CreateJobResponseSchema,
    status_code=status.HTTP_201_CREATED,
)
async def create_job(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    language: str = Form("auto"),
    speakers: str = Form("auto"),
    outputs: str = Form('{"summary":true,"notes":true,"analysis":true,"subtitles":true}'),
    context: str = Form(""),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> CreateJobResponseSchema:
    parsed_outputs = _parse_outputs_form_field(outputs)
    job_id = jobs_service.generate_job_id()
    upload_dir = settings.resolved_upload_dir

    stored_file = await save_upload_file(
        file,
        job_id=job_id,
        upload_dir=upload_dir,
        max_bytes=settings.max_upload_bytes,
    )

    try:
        jobs_service.create_job_record(
            db,
            job_id=job_id,
            title=title,
            language=language,
            speaker_hint=speakers,
            outputs=parsed_outputs,
            context=context,
            stored_file=stored_file,
            upload_dir=upload_dir,
            ai_provider_enabled=settings.ai_provider_enabled,
            run_local_worker=settings.run_local_worker_on_upload,
            whisper_model=settings.local_whisper_model,
            confidence_threshold=settings.diarization_confidence_threshold,
            session_factory=getattr(request.app.state, "session_factory", None),
        )
    except Exception:
        delete_stored_file(upload_dir, stored_file.stored_filename)
        raise

    return CreateJobResponseSchema(jobId=job_id)


@router.get(
    "",
    response_model=list[JobListItemSchema],
    response_model_exclude_none=True,
)
def list_jobs(db: Session = Depends(get_db)) -> list[JobListItemSchema]:
    return jobs_service.list_jobs(db)


@router.get("/capabilities")
def get_capabilities() -> dict[str, bool]:
    caps = get_local_runtime_capabilities()
    return {
        "ffmpegAvailable": caps.ffmpeg_available,
        "whisperAvailable": caps.whisper_available,
        "fasterWhisperAvailable": caps.faster_whisper_available,
        "openaiWhisperAvailable": caps.openai_whisper_available,
        "pyannoteAvailable": caps.pyannote_available,
    }


@router.get(
    "/search",
    response_model=list[TranscriptSearchHitSchema],
)
def search_transcripts(
    q: str = Query(..., min_length=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[TranscriptSearchHitSchema]:
    return jobs_service.search_transcript_segments(db, q, limit=limit)


@router.get(
    "/{job_id}",
    response_model=JobDetailSchema,
    response_model_exclude_none=True,
)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobDetailSchema:
    return jobs_service.get_job_detail(db, job_id)


@router.get("/{job_id}/media")
def stream_job_media(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> StreamingResponse:
    job = jobs_service.get_job_model(db, job_id, with_transcript=False)
    media_path = resolve_stored_file_path(settings.resolved_upload_dir, job.stored_filename)
    file_size = media_path.stat().st_size
    media_type = infer_media_content_type(media_path.name, job.content_type)
    inline_disposition = _build_inline_content_disposition(job.original_filename or media_path.name)

    range_header = request.headers.get("range")
    if range_header:
        start, end = _parse_byte_range(range_header, file_size)
        content_length = end - start + 1
        return StreamingResponse(
            _iter_file_range(media_path, start, end),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Disposition": inline_disposition,
            },
        )

    return StreamingResponse(
        _iter_file_range(media_path, 0, file_size - 1),
        status_code=status.HTTP_200_OK,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Disposition": inline_disposition,
        },
    )


@router.patch(
    "/{job_id}",
    response_model=JobDetailSchema,
    response_model_exclude_none=True,
)
def patch_job(
    job_id: str,
    payload: JobPatchRequestSchema,
    db: Session = Depends(get_db),
) -> JobDetailSchema:
    return jobs_service.patch_job(db, job_id, payload)


@router.post(
    "/{job_id}/cancel",
    response_model=JobDetailSchema,
    response_model_exclude_none=True,
)
def cancel_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> JobDetailSchema:
    return jobs_service.cancel_job(db, job_id)


@router.post(
    "/{job_id}/retry",
    response_model=JobDetailSchema,
    response_model_exclude_none=True,
)
def retry_job(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> JobDetailSchema:
    return jobs_service.retry_job(
        db,
        job_id,
        settings=settings,
        session_factory=getattr(request.app.state, "session_factory", None),
    )


@router.post(
    "/{job_id}/regenerate",
    response_model=JobDetailSchema,
    response_model_exclude_none=True,
)
def regenerate_job(
    job_id: str,
    payload: RegenerateRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> JobDetailSchema:
    return jobs_service.regenerate_job_section(
        db,
        job_id,
        payload.section,
        ai_provider_enabled=settings.ai_provider_enabled,
    )


@router.get("/{job_id}/export")
def export_job(
    job_id: str,
    format: ExportFormat = Query(...),
    timestamps: bool = Query(True),
    speakers: bool = Query(False),
    offsetSec: float = Query(0.0),
    db: Session = Depends(get_db),
) -> Response:
    job = jobs_service.get_job_detail(db, job_id)
    exported = export_job_file(
        job,
        fmt=format,
        timestamps=timestamps,
        speakers=speakers,
        offset_sec=offsetSec,
    )
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={"Content-Disposition": exported.content_disposition},
    )


@router.get("/{job_id}/audio")
async def download_job_audio(
    job_id: str,
    format: AudioFormat = Query("mp3"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> StreamingResponse:
    job = jobs_service.get_job_model(db, job_id, with_transcript=False)
    media_path = resolve_stored_file_path(settings.resolved_upload_dir, job.stored_filename)
    extracted = await prepare_extracted_audio(
        media_path=media_path,
        title=job.title,
        job_id=job.id,
        fmt=format,
    )
    return StreamingResponse(
        extracted.stream,
        status_code=status.HTTP_200_OK,
        media_type=extracted.media_type,
        headers={
            "Content-Length": str(extracted.content_length),
            "Content-Disposition": extracted.content_disposition,
        },
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> Response:
    jobs_service.delete_job_record(db, job_id, settings.resolved_upload_dir)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
