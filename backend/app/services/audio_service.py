from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator
from urllib.parse import quote

from fastapi import HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.schemas import AudioFormat

logger = logging.getLogger(__name__)

AUDIO_CHUNK_SIZE = 256 * 1024  # 256 KiB

AUDIO_MEDIA_TYPES: dict[AudioFormat, str] = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
}


@dataclass(frozen=True)
class ExtractedAudioStream:
    stream: Iterator[bytes]
    media_type: str
    content_disposition: str
    content_length: int


def _safe_filename_base(title: str, job_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", title.strip()).strip("-")
    if slug:
        return slug[:80].lower()
    safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", job_id)
    return f"callscribe-{safe_id}"


def _build_attachment_content_disposition(title: str, job_id: str, ext: str) -> str:
    ascii_base = _safe_filename_base(title, job_id)
    ascii_name = f"{ascii_base}.{ext}"

    utf8_base = re.sub(r'[/\\<>:"|?*\x00-\x1f]', "_", title.strip()).strip(".") or ascii_base
    utf8_name = f"{utf8_base[:80]}.{ext}"
    encoded_utf8 = quote(utf8_name, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded_utf8}'


def _iter_file_and_cleanup(file_path: Path, cleanup_dir: Path | None = None) -> Iterator[bytes]:
    try:
        with file_path.open("rb") as fh:
            while True:
                chunk = fh.read(AUDIO_CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
    finally:
        if cleanup_dir is not None:
            shutil.rmtree(cleanup_dir, ignore_errors=True)


def _run_ffmpeg_audio_extract(
    ffmpeg_bin: str,
    media_path: Path,
    out_path: Path,
    fmt: AudioFormat,
) -> None:
    cmd = [
        ffmpeg_bin,
        "-y",
        "-v",
        "error",
        "-i",
        str(media_path),
        "-vn",
    ]
    if fmt == "mp3":
        cmd.extend(["-acodec", "libmp3lame", "-q:a", "2"])
    else:
        cmd.extend(["-acodec", "pcm_s16le"])
    cmd.append(str(out_path))

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    stderr_text = (proc.stderr or "").strip()

    if proc.returncode != 0 or not out_path.is_file() or out_path.stat().st_size == 0:
        lower_err = stderr_text.lower()
        if (
            "does not contain any stream" in lower_err
            or "matches no streams" in lower_err
            or "no audio" in lower_err
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="The uploaded media file does not contain an audio track.",
            )
        logger.warning("ffmpeg audio extraction failed for %s: %s", media_path.name, stderr_text)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Could not extract an audio track from this media file.",
        )


async def prepare_extracted_audio(
    *,
    media_path: Path,
    title: str,
    job_id: str,
    fmt: AudioFormat,
) -> ExtractedAudioStream:
    """
    Extract or stream the audio track from an uploaded video/audio file.
    """
    disposition = _build_attachment_content_disposition(title, job_id, fmt)
    media_type = AUDIO_MEDIA_TYPES[fmt]

    if media_path.suffix.lower() == f".{fmt}":
        return ExtractedAudioStream(
            stream=_iter_file_and_cleanup(media_path),
            media_type=media_type,
            content_disposition=disposition,
            content_length=media_path.stat().st_size,
        )

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="FFmpeg is not installed on the server to extract audio from video.",
        )

    tmpdir = Path(tempfile.mkdtemp(prefix="callscribe_audio_"))
    out_path = tmpdir / f"extracted.{fmt}"
    try:
        await run_in_threadpool(_run_ffmpeg_audio_extract, ffmpeg_bin, media_path, out_path, fmt)
        size = out_path.stat().st_size
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise

    return ExtractedAudioStream(
        stream=_iter_file_and_cleanup(out_path, cleanup_dir=tmpdir),
        media_type=media_type,
        content_disposition=disposition,
        content_length=size,
    )
