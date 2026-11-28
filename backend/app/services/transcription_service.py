from __future__ import annotations

import importlib.util
import logging
import shutil
import subprocess
import tempfile
import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models import JobModel, SpeakerModel, TranscriptSegmentModel
from app.services.diarization_service import (
    AlignedSegment,
    AlignedSpeaker,
    TranscriptSegmentInput,
    WordTimestamp,
    is_pyannote_available,
)

logger = logging.getLogger(__name__)

_cancel_lock = threading.Lock()
_cancelled_jobs: set[str] = set()
_active_workers: set[str] = set()


@dataclass(frozen=True)
class LocalRuntimeCapabilities:
    ffmpeg_available: bool
    faster_whisper_available: bool
    openai_whisper_available: bool
    pyannote_available: bool

    @property
    def whisper_available(self) -> bool:
        return self.faster_whisper_available or self.openai_whisper_available


def get_local_runtime_capabilities() -> LocalRuntimeCapabilities:
    return LocalRuntimeCapabilities(
        ffmpeg_available=shutil.which("ffmpeg") is not None,
        faster_whisper_available=importlib.util.find_spec("faster_whisper") is not None,
        openai_whisper_available=importlib.util.find_spec("whisper") is not None,
        pyannote_available=is_pyannote_available(),
    )


def request_job_cancel(job_id: str) -> None:
    with _cancel_lock:
        _cancelled_jobs.add(job_id)


def clear_job_cancel(job_id: str) -> None:
    with _cancel_lock:
        _cancelled_jobs.discard(job_id)


def is_job_cancelled(job_id: str) -> bool:
    with _cancel_lock:
        return job_id in _cancelled_jobs


def is_worker_active(job_id: str) -> bool:
    with _cancel_lock:
        return job_id in _active_workers


class JobCancelledError(Exception):
    """Raised when a running transcription/diarization pipeline is cancelled by the user."""


def _check_cancelled(job_id: str) -> None:
    if is_job_cancelled(job_id):
        raise JobCancelledError(f"Job {job_id} was cancelled.")


def extract_wav_16k_mono(media_path: Path, out_wav: Path) -> float:
    """Extract a 16 kHz mono 16-bit PCM WAV track for Whisper/Pyannote and return duration in seconds."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError(
            "FFmpeg is not installed on the server. Install FFmpeg to prepare audio for transcription."
        )

    proc = subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-i",
            str(media_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-acodec",
            "pcm_s16le",
            str(out_wav),
        ],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if proc.returncode != 0 or not out_wav.is_file() or out_wav.stat().st_size == 0:
        err = (proc.stderr or "").strip()
        if "does not contain any stream" in err.lower() or "no audio" in err.lower():
            raise RuntimeError("The uploaded media file does not contain an audio track.")
        raise RuntimeError(f"FFmpeg audio preparation failed: {err or 'unknown error'}")

    with wave.open(str(out_wav), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate() or 16000
        return round(frames / float(rate), 3)


def run_local_whisper_asr(
    wav_path: Path,
    *,
    language: str = "auto",
    model_name: str = "base",
    progress_cb: Callable[[int], None] | None = None,
    job_id: str | None = None,
) -> tuple[list[TranscriptSegmentInput], str]:
    """
    Run local speech recognition using faster-whisper (preferred) or openai-whisper.
    Never sends raw audio to external LLMs.
    """
    caps = get_local_runtime_capabilities()
    lang_arg = None if not language or language == "auto" else language

    if caps.faster_whisper_available:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]

        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments_iter, info = model.transcribe(
            str(wav_path),
            language=lang_arg,
            word_timestamps=True,
            vad_filter=True,
        )
        total_dur = float(getattr(info, "duration", 0.0) or 0.0)
        detected_lang = str(getattr(info, "language", language) or language)
        out_segments: list[TranscriptSegmentInput] = []

        for idx, seg in enumerate(segments_iter, start=1):
            if job_id:
                _check_cancelled(job_id)
            words = tuple(
                WordTimestamp(
                    start=float(w.start),
                    end=float(w.end),
                    word=str(w.word),
                )
                for w in (getattr(seg, "words", None) or [])
            )
            out_segments.append(
                TranscriptSegmentInput(
                    id=f"seg-{idx}",
                    start=float(seg.start),
                    end=float(seg.end),
                    text=str(seg.text).strip(),
                    words=words,
                )
            )
            if progress_cb and total_dur > 0:
                pct = min(100, int((float(seg.end) / total_dur) * 100))
                progress_cb(pct)
        return out_segments, detected_lang

    if caps.openai_whisper_available:
        import whisper  # type: ignore[import-not-found]

        model = whisper.load_model(model_name)
        result = model.transcribe(
            str(wav_path),
            language=lang_arg,
            word_timestamps=True,
        )
        detected_lang = str(result.get("language") or language)
        out_segments = []
        for idx, seg in enumerate(result.get("segments") or [], start=1):
            if job_id:
                _check_cancelled(job_id)
            words = tuple(
                WordTimestamp(
                    start=float(w.get("start", seg["start"])),
                    end=float(w.get("end", seg["end"])),
                    word=str(w.get("word", "")),
                )
                for w in (seg.get("words") or [])
            )
            out_segments.append(
                TranscriptSegmentInput(
                    id=f"seg-{idx}",
                    start=float(seg["start"]),
                    end=float(seg["end"]),
                    text=str(seg["text"]).strip(),
                    words=words,
                )
            )
        return out_segments, detected_lang

    raise RuntimeError(
        "No local Whisper speech-recognition engine is installed. Install 'faster-whisper' or 'openai-whisper' to enable local transcription."
    )


def _persist_stage(
    session_factory: sessionmaker[Session],
    job_id: str,
    *,
    status_value: str,
    progress: int,
    stage_message: str | None = None,
    error: str | None = None,
    duration_sec: float | None = None,
    language: str | None = None,
    speakers: list[AlignedSpeaker] | None = None,
    segments: list[AlignedSegment] | None = None,
) -> None:
    with session_factory() as db:
        job = db.scalars(select(JobModel).where(JobModel.id == job_id)).first()
        if job is None:
            return
        job.status = status_value
        job.progress = max(0, min(100, int(progress)))
        job.stage_message = stage_message
        if error is not None or status_value not in {"failed", "cancelled"}:
            job.error = error
        if duration_sec is not None:
            job.duration_sec = duration_sec
        if language is not None and language != "auto":
            job.language = language

        if speakers is not None:
            job.speakers = [
                SpeakerModel(
                    speaker_id=s.id,
                    name=s.name,
                    color=s.color,
                    position=idx,
                )
                for idx, s in enumerate(speakers)
            ]
        if segments is not None:
            job.segments = [
                TranscriptSegmentModel(
                    segment_id=seg.id,
                    start_sec=seg.start,
                    end_sec=seg.end,
                    speaker_id=seg.speaker_id,
                    text=seg.text,
                    confidence=seg.confidence,
                    uncertain=seg.uncertain,
                    position=idx,
                )
                for idx, seg in enumerate(segments)
            ]
        db.commit()


def start_background_pipeline(
    *,
    session_factory: sessionmaker[Session],
    job_id: str,
    media_path: Path,
    language: str,
    speaker_hint: str,
    whisper_model: str = "base",
    confidence_threshold: float = 0.55,
) -> bool:
    """
    Launch a single background pipeline thread for a job if one is not already active.
    Returns False if a duplicate active worker for the same job_id is already running.
    """
    with _cancel_lock:
        if job_id in _active_workers:
            return False
        _cancelled_jobs.discard(job_id)
        _active_workers.add(job_id)

    def _run() -> None:
        tmpdir = Path(tempfile.mkdtemp(prefix=f"callscribe_proc_{job_id}_"))
        wav_path = tmpdir / "audio_16k.wav"
        try:
            _check_cancelled(job_id)
            _persist_stage(
                session_factory,
                job_id,
                status_value="extracting_audio",
                progress=10,
                stage_message="Preparing 16 kHz mono audio track...",
            )
            duration_sec = extract_wav_16k_mono(media_path, wav_path)

            _check_cancelled(job_id)
            _persist_stage(
                session_factory,
                job_id,
                status_value="transcribing",
                progress=25,
                stage_message="Transcribing speech locally with Whisper...",
                duration_sec=duration_sec,
            )

            def _on_asr_progress(pct: int) -> None:
                mapped = 25 + int(pct * 0.35)
                _persist_stage(
                    session_factory,
                    job_id,
                    status_value="transcribing",
                    progress=mapped,
                    stage_message="Transcribing speech locally with Whisper...",
                )

            raw_segments, detected_lang = run_local_whisper_asr(
                wav_path,
                language=language,
                model_name=whisper_model,
                progress_cb=_on_asr_progress,
                job_id=job_id,
            )

            neutral_speakers = [AlignedSpeaker(id="spk-1", name="Speaker 1", color="#6366F1")]
            clean_segments = [
                AlignedSegment(
                    id=seg.id,
                    start=seg.start,
                    end=seg.end,
                    speaker_id="spk-1",
                    text=seg.text,
                    confidence=1.0,
                    uncertain=False,
                )
                for seg in raw_segments
            ]

            _check_cancelled(job_id)
            _persist_stage(
                session_factory,
                job_id,
                status_value="aligning",
                progress=82,
                stage_message="Refining readable segments and timestamps...",
                language=detected_lang,
                speakers=neutral_speakers,
                segments=clean_segments,
            )

            _check_cancelled(job_id)
            _persist_stage(
                session_factory,
                job_id,
                status_value="done",
                progress=100,
                stage_message="Completed local transcription.",
                speakers=neutral_speakers,
                segments=clean_segments,
            )
        except JobCancelledError:
            _persist_stage(
                session_factory,
                job_id,
                status_value="cancelled",
                progress=0,
                stage_message="Processing cancelled by user.",
                error="Processing was cancelled by user.",
            )
        except Exception as exc:
            logger.exception("Pipeline error for job_id=%s", job_id)
            _persist_stage(
                session_factory,
                job_id,
                status_value="failed",
                progress=0,
                stage_message="Processing stopped with an error.",
                error=str(exc),
            )
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
            with _cancel_lock:
                _active_workers.discard(job_id)
                _cancelled_jobs.discard(job_id)

    thread = threading.Thread(target=_run, name=f"callscribe-{job_id}", daemon=True)
    thread.start()
    return True
