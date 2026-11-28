from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

ALLOWED_MEDIA_EXTENSIONS = frozenset({
    ".mp4",
    ".mov",
    ".mkv",
    ".webm",
    ".mp3",
    ".m4a",
    ".wav",
})

EXTENSION_MIME_MAP = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
}

ALLOWED_MEDIA_MIME_TYPES = frozenset({
    "video/mp4",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/webm",
})

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MiB


@dataclass(frozen=True)
class StoredUploadResult:
    original_filename: str
    stored_filename: str
    content_type: str
    size_bytes: int


def _validate_filename_and_extension(raw_filename: str | None) -> tuple[str, str]:
    if not raw_filename or not raw_filename.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must include a valid filename.",
        )

    cleaned = raw_filename.strip()

    if "\x00" in cleaned or "/" in cleaned or "\\" in cleaned or ".." in cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: path traversal characters are not permitted.",
        )

    safe_name = Path(cleaned).name
    if not safe_name or safe_name in {".", ".."}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must include a valid filename.",
        )

    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_MEDIA_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f'Unsupported file type "{safe_name}". '
                "Allowed: MP4, MOV, MKV, WebM, MP3, M4A, WAV."
            ),
        )

    return safe_name, ext


def ensure_upload_dir(upload_dir: Path) -> Path:
    resolved = upload_dir.resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def infer_media_content_type(
    stored_filename: str,
    recorded_content_type: str | None = None,
) -> str:
    ext = Path(stored_filename).suffix.lower()
    if recorded_content_type:
        cleaned = recorded_content_type.strip().lower()
        if cleaned in ALLOWED_MEDIA_MIME_TYPES:
            return cleaned
    return EXTENSION_MIME_MAP.get(ext, "application/octet-stream")


def resolve_stored_file_path(upload_dir: Path, stored_filename: str | None) -> Path:
    """Safely resolve a stored media file path inside upload_dir or raise 404."""
    if not stored_filename or not stored_filename.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No media file is associated with this recording.",
        )

    cleaned = stored_filename.strip()
    if "\x00" in cleaned or "/" in cleaned or "\\" in cleaned or ".." in cleaned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found.",
        )

    root = upload_dir.resolve()
    candidate = (root / cleaned).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found on storage.",
        )
    return candidate


async def save_upload_file(
    upload: UploadFile,
    *,
    job_id: str,
    upload_dir: Path,
    max_bytes: int,
) -> StoredUploadResult:
    """Validate and stream an uploaded media file to private filesystem storage."""
    safe_name, ext = _validate_filename_and_extension(upload.filename)

    raw_content_type = (upload.content_type or "application/octet-stream").strip().lower()
    if (
        raw_content_type
        and raw_content_type != "application/octet-stream"
        and raw_content_type not in ALLOWED_MEDIA_MIME_TYPES
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Unsupported media content type "{raw_content_type}" for "{safe_name}".',
        )

    effective_content_type = infer_media_content_type(safe_name, raw_content_type)

    root = ensure_upload_dir(upload_dir)
    stored_filename = f"{job_id}_{uuid.uuid4().hex}{ext}"
    dest_path = (root / stored_filename).resolve()

    if not dest_path.is_relative_to(root):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid storage destination path.",
        )

    total_bytes = 0
    try:
        with dest_path.open("wb") as out_file:
            while True:
                chunk = await upload.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f'"{safe_name}" exceeds the maximum allowed upload size of {max_bytes} bytes.',
                    )
                out_file.write(chunk)

        if total_bytes <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'"{safe_name}" is empty (0 B).',
            )
    except Exception:
        if dest_path.exists():
            try:
                dest_path.unlink()
            except OSError as cleanup_err:
                logger.warning("Failed to remove partial upload %s: %s", dest_path, cleanup_err)
        raise

    logger.info(
        "Stored upload job_id=%s original=%s stored=%s bytes=%d",
        job_id,
        safe_name,
        stored_filename,
        total_bytes,
    )
    return StoredUploadResult(
        original_filename=safe_name,
        stored_filename=stored_filename,
        content_type=effective_content_type,
        size_bytes=total_bytes,
    )


def delete_stored_file(upload_dir: Path, stored_filename: str | None) -> bool:
    """Safely delete a stored upload file if present inside upload_dir."""
    if not stored_filename:
        return False

    cleaned = stored_filename.strip()
    if "\x00" in cleaned or "/" in cleaned or "\\" in cleaned or ".." in cleaned:
        logger.warning("Blocked unsafe file deletion path: %s", stored_filename)
        return False

    root = upload_dir.resolve()
    candidate = (root / Path(cleaned).name).resolve()
    if not candidate.is_relative_to(root):
        logger.warning("Blocked unsafe file deletion outside upload_dir: %s", stored_filename)
        return False

    if not candidate.exists():
        return False

    candidate.unlink()
    logger.info("Deleted stored media file %s", candidate.name)
    return True
