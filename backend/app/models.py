from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    language: Mapped[str] = mapped_column(String(32), nullable=False, default="auto")
    speaker_hint: Mapped[str] = mapped_column(String(16), nullable=False, default="auto")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stage_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    client: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pinned: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False)

    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key_points_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bookmarks_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_items_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    outputs_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    original_filename: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    stored_filename: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    speakers: Mapped[list[SpeakerModel]] = relationship(
        "SpeakerModel",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="SpeakerModel.position",
    )
    segments: Mapped[list[TranscriptSegmentModel]] = relationship(
        "TranscriptSegmentModel",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="TranscriptSegmentModel.position",
    )


class SpeakerModel(Base):
    __tablename__ = "speakers"
    __table_args__ = (UniqueConstraint("job_id", "speaker_id", name="uq_job_speaker"),)

    pk: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    speaker_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(32), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    job: Mapped[JobModel] = relationship("JobModel", back_populates="speakers")


class TranscriptSegmentModel(Base):
    __tablename__ = "transcript_segments"
    __table_args__ = (UniqueConstraint("job_id", "segment_id", name="uq_job_segment"),)

    pk: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_id: Mapped[str] = mapped_column(String(128), nullable=False)
    start_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    speaker_id: Mapped[str] = mapped_column(String(64), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    uncertain: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    job: Mapped[JobModel] = relationship("JobModel", back_populates="segments")
