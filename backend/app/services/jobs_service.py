from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.config import Settings
from app.models import JobModel, SpeakerModel, TranscriptSegmentModel
from app.schemas import (
    ActionItemSchema,
    BookmarkSchema,
    JobAnalysisSchema,
    JobDetailSchema,
    JobListItemSchema,
    JobPatchRequestSchema,
    NoteSectionSchema,
    OutputSelectionsSchema,
    RegenerateSection,
    SpeakerOut,
    TranscriptSearchHitSchema,
    TranscriptSegmentOut,
)
from app.services.ai_pipeline import TranscriptionRequest, get_ai_provider
from app.services.storage import StoredUploadResult, delete_stored_file, resolve_stored_file_path
from app.services.transcription_service import (
    is_worker_active,
    request_job_cancel,
    start_background_pipeline,
)

logger = logging.getLogger(__name__)

# Matches DISTINCT_SPEAKER_COLORS in src/utils/format.ts
DISTINCT_SPEAKER_COLORS = [
    "#6366F1",  # Indigo
    "#06B6D4",  # Cyan
    "#10B981",  # Emerald
    "#F59E0B",  # Amber
    "#EC4899",  # Pink
    "#8B5CF6",  # Violet
    "#F97316",  # Orange
    "#14B8A6",  # Teal
]

PROCESSING_STATUSES = {
    "queued",
    "extracting_audio",
    "transcribing",
    "diarizing",
    "aligning",
    "analyzing",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_media_url(job_id: str) -> str:
    return f"/api/jobs/{job_id}/media"


def _get_distinct_speaker_color(index: int) -> str:
    return DISTINCT_SPEAKER_COLORS[index % len(DISTINCT_SPEAKER_COLORS)]


def _parse_json_or_none(raw: str | None):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _serialize_speakers(speakers: list[SpeakerModel]) -> list[SpeakerOut]:
    return [
        SpeakerOut(id=s.speaker_id, name=s.name, color=s.color)
        for s in sorted(speakers, key=lambda item: item.position)
    ]


def _serialize_segments(segments: list[TranscriptSegmentModel]) -> list[TranscriptSegmentOut]:
    return [
        TranscriptSegmentOut(
            id=seg.segment_id,
            start=seg.start_sec,
            end=seg.end_sec,
            speakerId=seg.speaker_id,
            text=seg.text,
            confidence=seg.confidence,
            uncertain=seg.uncertain,
        )
        for seg in sorted(segments, key=lambda item: (item.position, item.start_sec))
    ]


def serialize_job_list_item(job: JobModel) -> JobListItemSchema:
    tags = _parse_json_or_none(job.tags_json)
    key_points = _parse_json_or_none(job.key_points_json)
    raw_notes = _parse_json_or_none(job.notes_json)
    raw_analysis = _parse_json_or_none(job.analysis_json)
    raw_bookmarks = _parse_json_or_none(job.bookmarks_json)
    raw_action_items = _parse_json_or_none(job.action_items_json)

    notes = [NoteSectionSchema.model_validate(item) for item in raw_notes] if isinstance(raw_notes, list) else None
    analysis = JobAnalysisSchema.model_validate(raw_analysis) if isinstance(raw_analysis, dict) else None
    bookmarks = (
        [BookmarkSchema.model_validate(item) for item in raw_bookmarks]
        if isinstance(raw_bookmarks, list)
        else None
    )
    action_items = (
        [ActionItemSchema.model_validate(item) for item in raw_action_items]
        if isinstance(raw_action_items, list)
        else None
    )
    audio_url = job.audio_url or (build_media_url(job.id) if job.stored_filename else None)

    return JobListItemSchema(
        id=job.id,
        title=job.title,
        createdAt=job.created_at,
        durationSec=job.duration_sec,
        language=job.language,
        status=job.status,  # type: ignore[arg-type]
        progress=job.progress,
        stageMessage=job.stage_message,
        error=job.error,
        audioUrl=audio_url,
        client=job.client,
        tags=tags if isinstance(tags, list) else None,
        pinned=job.pinned,
        speakers=_serialize_speakers(job.speakers),
        summary=job.summary,
        keyPoints=key_points if isinstance(key_points, list) else None,
        notes=notes,
        analysis=analysis,
        bookmarks=bookmarks,
        actionItems=action_items,
    )


def serialize_job_detail(job: JobModel) -> JobDetailSchema:
    base = serialize_job_list_item(job)
    return JobDetailSchema(
        **base.model_dump(),
        transcript=_serialize_segments(job.segments),
    )


def _initial_speaker_count(speaker_hint: str) -> int:
    hint = speaker_hint.strip().lower()
    if hint == "2":
        return 2
    if hint == "3":
        return 3
    if hint in {"4", "4+"}:
        return 4
    return 0


def generate_job_id() -> str:
    return f"job-{uuid.uuid4().hex[:12]}"


def create_job_record(
    db: Session,
    *,
    job_id: str,
    title: str,
    language: str,
    speaker_hint: str,
    outputs: OutputSelectionsSchema,
    context: str,
    stored_file: StoredUploadResult,
    upload_dir: Path,
    ai_provider_enabled: bool = False,
    run_local_worker: bool = False,
    whisper_model: str = "base",
    confidence_threshold: float = 0.55,
    session_factory: Optional[sessionmaker[Session]] = None,
) -> JobModel:
    now_iso = utc_now_iso()
    clean_title = title.strip() or Path(stored_file.original_filename).stem or stored_file.original_filename
    clean_language = language.strip() or "auto"
    clean_speaker_hint = speaker_hint.strip() or "auto"
    media_path = (upload_dir / stored_file.stored_filename).resolve()

    job = JobModel(
        id=job_id,
        title=clean_title,
        created_at=now_iso,
        updated_at=now_iso,
        duration_sec=0.0,
        language=clean_language,
        speaker_hint=clean_speaker_hint,
        status="queued",
        progress=0,
        audio_url=build_media_url(job_id),
        pinned=False,
        outputs_json=outputs.model_dump_json(),
        context=context.strip() or None,
        original_filename=stored_file.original_filename,
        stored_filename=stored_file.stored_filename,
        content_type=stored_file.content_type,
        file_size_bytes=stored_file.size_bytes,
    )

    speaker_count = _initial_speaker_count(clean_speaker_hint)
    for idx in range(speaker_count):
        job.speakers.append(
            SpeakerModel(
                speaker_id=f"spk-{idx + 1}",
                name=f"Speaker {idx + 1}",
                color=_get_distinct_speaker_color(idx),
                position=idx,
            )
        )

    get_ai_provider(enabled=ai_provider_enabled).enqueue_transcription(
        job,
        TranscriptionRequest(
            job_id=job.id,
            media_path=media_path,
            language=clean_language,
            speaker_hint=clean_speaker_hint,
            context=context.strip(),
        ),
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    if ai_provider_enabled and run_local_worker and session_factory is not None:
        start_background_pipeline(
            session_factory=session_factory,
            job_id=job.id,
            media_path=media_path,
            language=clean_language,
            speaker_hint=clean_speaker_hint,
            whisper_model=whisper_model,
            confidence_threshold=confidence_threshold,
        )

    return job


def list_jobs(db: Session) -> list[JobListItemSchema]:
    stmt = (
        select(JobModel)
        .options(selectinload(JobModel.speakers))
        .order_by(JobModel.created_at.desc())
    )
    jobs = list(db.scalars(stmt).all())
    return [serialize_job_list_item(job) for job in jobs]


def get_job_model(db: Session, job_id: str, *, with_transcript: bool = True) -> JobModel:
    options = [selectinload(JobModel.speakers)]
    if with_transcript:
        options.append(selectinload(JobModel.segments))
    stmt = select(JobModel).options(*options).where(JobModel.id == job_id)
    job: Optional[JobModel] = db.scalars(stmt).first()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Recording "{job_id}" not found.',
        )
    return job


def get_job_detail(db: Session, job_id: str) -> JobDetailSchema:
    job = get_job_model(db, job_id, with_transcript=True)
    return serialize_job_detail(job)


def patch_job(db: Session, job_id: str, payload: JobPatchRequestSchema) -> JobDetailSchema:
    job = get_job_model(db, job_id, with_transcript=True)
    fields_set = payload.model_fields_set

    if "title" in fields_set and payload.title is not None:
        job.title = payload.title

    if "pinned" in fields_set:
        job.pinned = bool(payload.pinned) if payload.pinned is not None else False

    if "client" in fields_set:
        job.client = payload.client.strip() if payload.client is not None and payload.client.strip() else None

    if "tags" in fields_set:
        if payload.tags is None:
            job.tags_json = None
        else:
            cleaned_tags = [tag.strip() for tag in payload.tags if tag.strip()]
            job.tags_json = json.dumps(cleaned_tags)

    if "summary" in fields_set:
        job.summary = payload.summary.strip() if payload.summary is not None and payload.summary.strip() else None

    if "keyPoints" in fields_set:
        if payload.keyPoints is None:
            job.key_points_json = None
        else:
            cleaned_kp = [kp.strip() for kp in payload.keyPoints if kp.strip()]
            job.key_points_json = json.dumps(cleaned_kp)

    if "notes" in fields_set:
        if payload.notes is None:
            job.notes_json = None
        else:
            job.notes_json = json.dumps([section.model_dump() for section in payload.notes])

    if "analysis" in fields_set:
        if payload.analysis is None:
            job.analysis_json = None
        else:
            job.analysis_json = json.dumps(payload.analysis.model_dump(exclude_none=True))

    if "bookmarks" in fields_set:
        if payload.bookmarks is None:
            job.bookmarks_json = None
        else:
            sorted_bookmarks = sorted(payload.bookmarks, key=lambda b: b.timeSec)
            job.bookmarks_json = json.dumps([bm.model_dump(exclude_none=True) for bm in sorted_bookmarks])

    if "actionItems" in fields_set:
        if payload.actionItems is None:
            job.action_items_json = None
        else:
            job.action_items_json = json.dumps(
                [item.model_dump(exclude_none=True) for item in payload.actionItems]
            )

    if "speakers" in fields_set and payload.speakers is not None:
        existing_speakers = {spk.speaker_id: spk for spk in job.speakers}
        incoming_ids = {spk.id for spk in payload.speakers}

        for spk in list(job.speakers):
            if spk.speaker_id not in incoming_ids:
                job.speakers.remove(spk)
        db.flush()

        for idx, incoming in enumerate(payload.speakers):
            existing = existing_speakers.get(incoming.id)
            if existing is not None:
                existing.name = incoming.name.strip() or existing.name
                if incoming.color is not None and incoming.color.strip():
                    existing.color = incoming.color.strip()
                existing.position = idx
            else:
                color = (
                    incoming.color.strip()
                    if incoming.color is not None and incoming.color.strip()
                    else _get_distinct_speaker_color(idx)
                )
                job.speakers.append(
                    SpeakerModel(
                        speaker_id=incoming.id,
                        name=incoming.name.strip(),
                        color=color,
                        position=idx,
                    )
                )

    if "transcript" in fields_set and payload.transcript is not None:
        existing_segments = {seg.segment_id: seg for seg in job.segments}
        incoming_ids = {seg.id for seg in payload.transcript}

        for seg in list(job.segments):
            if seg.segment_id not in incoming_ids:
                job.segments.remove(seg)
        db.flush()

        for idx, incoming in enumerate(payload.transcript):
            existing = existing_segments.get(incoming.id)
            if existing is not None:
                existing.text = incoming.text
                if incoming.start is not None:
                    existing.start_sec = incoming.start
                if incoming.end is not None:
                    existing.end_sec = incoming.end
                if incoming.speakerId is not None:
                    existing.speaker_id = incoming.speakerId
                if incoming.confidence is not None:
                    existing.confidence = incoming.confidence
                if incoming.uncertain is not None:
                    existing.uncertain = incoming.uncertain
                if existing.end_sec < existing.start_sec:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f'Segment "{incoming.id}" end timestamp cannot be earlier than start.',
                    )
                existing.position = idx
            else:
                if incoming.start is None or incoming.end is None or incoming.speakerId is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=(
                            f'New transcript segment "{incoming.id}" must include '
                            "start, end, speakerId, and text."
                        ),
                    )
                job.segments.append(
                    TranscriptSegmentModel(
                        segment_id=incoming.id,
                        start_sec=incoming.start,
                        end_sec=incoming.end,
                        speaker_id=incoming.speakerId,
                        text=incoming.text,
                        confidence=incoming.confidence,
                        uncertain=incoming.uncertain,
                        position=idx,
                    )
                )

    job.updated_at = utc_now_iso()
    db.commit()
    db.refresh(job)
    return serialize_job_detail(get_job_model(db, job.id, with_transcript=True))


def search_transcript_segments(
    db: Session,
    query: str,
    *,
    limit: int = 25,
) -> list[TranscriptSearchHitSchema]:
    trimmed = query.strip()
    if len(trimmed) < 2:
        return []

    stmt = (
        select(TranscriptSegmentModel, JobModel)
        .join(JobModel, TranscriptSegmentModel.job_id == JobModel.id)
        .options(selectinload(JobModel.speakers))
        .where(TranscriptSegmentModel.text.ilike(f"%{trimmed}%"))
        .order_by(JobModel.created_at.desc(), TranscriptSegmentModel.position.asc())
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    hits: list[TranscriptSearchHitSchema] = []
    for seg, job in rows:
        speaker_lookup = {spk.speaker_id: spk.name for spk in job.speakers}
        hits.append(
            TranscriptSearchHitSchema(
                jobId=job.id,
                jobTitle=job.title,
                segmentId=seg.segment_id,
                speakerId=seg.speaker_id,
                speakerName=speaker_lookup.get(seg.speaker_id, seg.speaker_id),
                start=seg.start_sec,
                end=seg.end_sec,
                text=seg.text,
            )
        )
    return hits


def cancel_job(db: Session, job_id: str) -> JobDetailSchema:
    job = get_job_model(db, job_id, with_transcript=True)
    request_job_cancel(job_id)

    if job.status == "cancelled":
        return serialize_job_detail(job)

    if job.status not in PROCESSING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Cannot cancel recording in "{job.status}" state.',
        )

    job.status = "cancelled"
    job.progress = 0
    job.stage_message = "Cancelled by user."
    job.error = "Processing was cancelled by user."
    job.updated_at = utc_now_iso()
    db.commit()
    return serialize_job_detail(get_job_model(db, job.id, with_transcript=True))


def retry_job(
    db: Session,
    job_id: str,
    *,
    settings: Settings,
    session_factory: Optional[sessionmaker[Session]] = None,
) -> JobDetailSchema:
    job = get_job_model(db, job_id, with_transcript=True)
    if is_worker_active(job_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A processing worker is already active for this recording.",
        )

    media_path = resolve_stored_file_path(settings.resolved_upload_dir, job.stored_filename)
    job.error = None
    job.progress = 0
    job.stage_message = None

    get_ai_provider(enabled=settings.ai_provider_enabled).enqueue_transcription(
        job,
        TranscriptionRequest(
            job_id=job.id,
            media_path=media_path,
            language=job.language,
            speaker_hint=job.speaker_hint,
            context=job.context or "",
        ),
    )

    job.updated_at = utc_now_iso()
    db.commit()

    if settings.ai_provider_enabled and settings.run_local_worker_on_upload and session_factory is not None:
        start_background_pipeline(
            session_factory=session_factory,
            job_id=job.id,
            media_path=media_path,
            language=job.language,
            speaker_hint=job.speaker_hint,
            whisper_model=settings.local_whisper_model,
            confidence_threshold=settings.diarization_confidence_threshold,
        )

    return serialize_job_detail(get_job_model(db, job.id, with_transcript=True))


def regenerate_job_section(
    db: Session,
    job_id: str,
    section: RegenerateSection,
    *,
    ai_provider_enabled: bool = False,
) -> JobDetailSchema:
    job = get_job_model(db, job_id, with_transcript=True)
    get_ai_provider(enabled=ai_provider_enabled).regenerate_section(job, section)
    job.updated_at = utc_now_iso()
    db.commit()
    return serialize_job_detail(get_job_model(db, job.id, with_transcript=True))


def delete_job_record(db: Session, job_id: str, upload_dir: Path) -> None:
    job = get_job_model(db, job_id, with_transcript=False)
    request_job_cancel(job_id)
    stored_filename = job.stored_filename

    db.delete(job)
    db.commit()

    delete_stored_file(upload_dir, stored_filename)
    logger.info("Deleted job_id=%s", job_id)
