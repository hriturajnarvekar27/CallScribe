from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from fastapi import HTTPException, status

from app.models import JobModel
from app.schemas import RegenerateSection

logger = logging.getLogger(__name__)

UNCONFIGURED_TRANSCRIPTION_MESSAGE = (
    "Transcription engine is not configured. Your recording has been uploaded and saved "
    "successfully. Enable an AI provider to process this recording."
)


@dataclass(frozen=True)
class TranscriptionRequest:
    job_id: str
    media_path: Path
    language: str
    speaker_hint: str
    context: str


class AIProvider(Protocol):
    """Modular Phase 2 boundary for transcription (ASR/diarization) and intelligence."""

    def enqueue_transcription(self, job: JobModel, request: TranscriptionRequest) -> None:
        ...

    def regenerate_section(self, job: JobModel, section: RegenerateSection) -> None:
        ...


class Phase1DeferredAIProvider:
    """
    Honest Phase 1 provider used when no AI transcription/LLM backend is enabled.

    - Preserves the uploaded recording for playback and future processing.
    - Transitions newly uploaded jobs from 'queued' to terminal 'failed' with a clear message
      so the frontend stops polling cleanly and does not fabricate transcripts/insights.
    - Rejects regeneration requests with HTTP 501 Not Implemented without modifying job data.
    """

    def enqueue_transcription(self, job: JobModel, request: TranscriptionRequest) -> None:
        logger.info(
            "AI provider disabled: transitioning job_id=%s from queued to failed (file retained at %s)",
            request.job_id,
            request.media_path.name,
        )
        job.status = "failed"
        job.progress = 0
        job.error = UNCONFIGURED_TRANSCRIPTION_MESSAGE

    def regenerate_section(self, job: JobModel, section: RegenerateSection) -> None:
        logger.info(
            "Regeneration rejected (501 Not Implemented): job_id=%s section=%s",
            job.id,
            section,
        )
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                f'Cannot regenerate "{section}": AI intelligence provider is not configured. '
                "Enable an AI provider in Phase 2 to generate or refresh sections."
            ),
        )


class Phase2QueuedWorkerStub:
    """
    Configurable Phase 2 hook when `ai_provider_enabled=True`.

    Leaves newly uploaded jobs in 'queued' for an asynchronous transcription worker without
    changing the upload endpoint contract.
    """

    def enqueue_transcription(self, job: JobModel, request: TranscriptionRequest) -> None:
        logger.info(
            "AI worker hook enabled: queued job_id=%s language=%s media=%s",
            request.job_id,
            request.language,
            request.media_path.name,
        )
        job.status = "queued"
        job.progress = 0
        job.stage_message = "Queued for local transcription & speaker diarization."
        job.error = None

    def regenerate_section(self, job: JobModel, section: RegenerateSection) -> None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                f'Regeneration provider for "{section}" is handled via the Express Gemini endpoint (/api/ai/summarize) '
                "or requires attaching an LLM provider in ai_pipeline.py."
            ),
        )


def get_ai_provider(*, enabled: bool = False) -> AIProvider:
    if enabled:
        return Phase2QueuedWorkerStub()
    return Phase1DeferredAIProvider()
