from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

JobStatus = Literal[
    "queued",
    "extracting_audio",
    "transcribing",
    "diarizing",
    "aligning",
    "analyzing",
    "done",
    "failed",
    "cancelled",
]

ExportFormat = Literal["docx", "pdf", "md", "txt", "srt", "vtt"]

AudioFormat = Literal["mp3", "wav"]

RegenerateSection = Literal["summary", "notes", "analysis"]

SentimentType = Literal["positive", "neutral", "negative"]

BookmarkCategory = Literal["important", "question", "decision", "follow-up", "note"]


class SpeakerSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    color: Optional[str] = Field(default=None, max_length=32)


class TranscriptSegmentSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128)
    start: Optional[float] = Field(default=None, ge=0)
    end: Optional[float] = Field(default=None, ge=0)
    speakerId: Optional[str] = Field(default=None, min_length=1, max_length=64)
    text: str
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    uncertain: Optional[bool] = None

    @model_validator(mode="after")
    def _validate_timestamps(self) -> TranscriptSegmentSchema:
        if self.start is not None and self.end is not None and self.end < self.start:
            raise ValueError("Segment 'end' timestamp must be greater than or equal to 'start'.")
        return self


class TranscriptSegmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    start: float
    end: float
    speakerId: str
    text: str
    confidence: Optional[float] = None
    uncertain: Optional[bool] = None


class SpeakerOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    color: str


class NoteSectionSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    heading: str = Field(..., min_length=1, max_length=255)
    bullets: list[str] = Field(default_factory=list)


class BookmarkSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128)
    timeSec: float = Field(..., ge=0.0)
    category: BookmarkCategory = "important"
    label: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=1000)
    createdAt: Optional[str] = None


class ActionItemSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128)
    task: str = Field(..., min_length=1, max_length=500)
    owner: Optional[str] = Field(default=None, max_length=160)
    deadline: Optional[str] = Field(default=None, max_length=160)
    timestampSec: Optional[float] = Field(default=None, ge=0.0)
    completed: bool = False


class JobAnalysisSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sentiment: SentimentType = "neutral"
    sentimentNote: str = ""
    topics: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    nextSteps: list[str] = Field(default_factory=list)
    questionsRaised: Optional[list[str]] = None


class OutputSelectionsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: bool = True
    notes: bool = True
    analysis: bool = True
    subtitles: bool = True


class JobListItemSchema(BaseModel):
    """Job representation for GET /api/jobs (omits transcript array for list efficiency)."""

    id: str
    title: str
    createdAt: str
    durationSec: float
    language: str
    status: JobStatus
    progress: int = Field(ge=0, le=100)
    stageMessage: Optional[str] = None
    error: Optional[str] = None
    audioUrl: Optional[str] = None
    client: Optional[str] = None
    tags: Optional[list[str]] = None
    pinned: Optional[bool] = None
    speakers: list[SpeakerOut] = Field(default_factory=list)
    summary: Optional[str] = None
    keyPoints: Optional[list[str]] = None
    notes: Optional[list[NoteSectionSchema]] = None
    analysis: Optional[JobAnalysisSchema] = None
    bookmarks: Optional[list[BookmarkSchema]] = None
    actionItems: Optional[list[ActionItemSchema]] = None


class JobDetailSchema(JobListItemSchema):
    """Complete Job representation for GET /api/jobs/{id}, PATCH, and POST regenerate."""

    transcript: list[TranscriptSegmentOut] = Field(default_factory=list)


class CreateJobResponseSchema(BaseModel):
    jobId: str


class JobPatchRequestSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=512)
    speakers: Optional[list[SpeakerSchema]] = None
    transcript: Optional[list[TranscriptSegmentSchema]] = None
    summary: Optional[str] = None
    keyPoints: Optional[list[str]] = None
    notes: Optional[list[NoteSectionSchema]] = None
    analysis: Optional[JobAnalysisSchema] = None
    bookmarks: Optional[list[BookmarkSchema]] = None
    actionItems: Optional[list[ActionItemSchema]] = None
    pinned: Optional[bool] = None
    client: Optional[str] = Field(default=None, max_length=255)
    tags: Optional[list[str]] = None

    @model_validator(mode="after")
    def _strip_title(self) -> JobPatchRequestSchema:
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must be a non-empty string.")
            self.title = self.title.strip()
        return self


class RegenerateRequestSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section: RegenerateSection


class TranscriptSearchHitSchema(BaseModel):
    jobId: str
    jobTitle: str
    segmentId: str
    speakerId: str
    speakerName: str
    start: float
    end: float
    text: str


class HealthResponseSchema(BaseModel):
    status: Literal["ok"]
    database: Literal["connected"]
    storage: Literal["ready"]
