from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.ai_pipeline import UNCONFIGURED_TRANSCRIPTION_MESSAGE
from app.services.diarization_service import (
    UNKNOWN_SPEAKER_ID,
    UNKNOWN_SPEAKER_NAME,
    DiarizationTurn,
    TranscriptSegmentInput,
    WordTimestamp,
    align_transcript_with_diarization,
)
from tests.test_jobs_api import _seed_completed_job_content, _upload_sample_job


def test_diarization_alignment_overlap_beats_start_only():
    # Segment starts slightly inside SPEAKER_00 tail (0.0-0.2s) but 90% overlaps SPEAKER_01 (0.2-3.0s)
    segments = [
        TranscriptSegmentInput(
            id="seg-1",
            start=0.0,
            end=3.0,
            text="I agree, let us proceed with Tuesday launch.",
        )
    ]
    turns = [
        DiarizationTurn(start=0.0, end=0.2, speaker_id="SPEAKER_00"),
        DiarizationTurn(start=0.2, end=3.2, speaker_id="SPEAKER_01"),
    ]
    result = align_transcript_with_diarization(segments, turns, confidence_threshold=0.55)
    assert len(result.segments) == 1
    assert result.segments[0].speaker_id == "spk-1"
    assert result.segments[0].confidence >= 0.85
    assert result.segments[0].uncertain is False
    assert not result.used_unknown_speaker


def test_diarization_alignment_splits_multi_speaker_words_and_smooths_micro_interruptions():
    words = (
        WordTimestamp(start=0.0, end=0.5, word="We"),
        WordTimestamp(start=0.5, end=1.0, word="shipped"),
        WordTimestamp(start=1.0, end=1.6, word="yesterday."),
        WordTimestamp(start=2.0, end=2.6, word="Great,"),
        WordTimestamp(start=2.6, end=3.2, word="thank"),
        WordTimestamp(start=3.2, end=3.8, word="you!"),
    )
    segments = [
        TranscriptSegmentInput(
            id="seg-1",
            start=0.0,
            end=3.8,
            text="We shipped yesterday. Great, thank you!",
            words=words,
        )
    ]
    # Include a tiny 0.25s sandwiched micro-interruption inside SPEAKER_00 before clean handoff to SPEAKER_01
    turns = [
        DiarizationTurn(start=0.0, end=0.75, speaker_id="SPEAKER_00"),
        DiarizationTurn(start=0.75, end=1.0, speaker_id="SPEAKER_02"),
        DiarizationTurn(start=1.0, end=1.8, speaker_id="SPEAKER_00"),
        DiarizationTurn(start=1.9, end=4.0, speaker_id="SPEAKER_01"),
    ]
    result = align_transcript_with_diarization(segments, turns, confidence_threshold=0.55)
    assert len(result.segments) == 2
    assert result.segments[0].id == "seg-1-p1"
    assert result.segments[0].text == "We shipped yesterday."
    assert result.segments[0].speaker_id == "spk-1"
    assert result.segments[1].id == "seg-1-p2"
    assert result.segments[1].text == "Great, thank you!"
    assert result.segments[1].speaker_id == "spk-2"


def test_diarization_alignment_marks_low_confidence_as_unknown_speaker():
    segments = [
        TranscriptSegmentInput(id="seg-1", start=0.0, end=2.0, text="Clear turn."),
        TranscriptSegmentInput(id="seg-2", start=10.0, end=12.0, text="Who said that?"),
    ]
    turns = [
        DiarizationTurn(start=0.0, end=2.1, speaker_id="SPEAKER_00"),
        # seg-2 has no overlapping diarization turn at 10.0-12.0
    ]
    result = align_transcript_with_diarization(segments, turns, confidence_threshold=0.55)
    assert result.used_unknown_speaker is True
    assert result.segments[0].speaker_id == "spk-1"
    assert result.segments[0].uncertain is False
    assert result.segments[1].speaker_id == UNKNOWN_SPEAKER_ID
    assert result.segments[1].uncertain is True
    assert any(s.id == UNKNOWN_SPEAKER_ID and s.name == UNKNOWN_SPEAKER_NAME for s in result.speakers)


def test_patch_bookmarks_action_items_summary_confidence_and_exports(client: TestClient):
    job_id = _upload_sample_job(client, title="Architecture Review").json()["jobId"]
    _seed_completed_job_content(client, job_id)

    patch_res = client.patch(
        f"/api/jobs/{job_id}",
        json={
            "summary": "Edited executive summary verified by user.",
            "keyPoints": ["Use local Whisper + Pyannote", "Verify speaker confidence"],
            "analysis": {
                "sentiment": "positive",
                "sentimentNote": "Team aligned on architecture.",
                "topics": ["Diarization", "Exports"],
                "decisions": ["Keep transcription local-first."],
                "concerns": [],
                "risks": [],
                "nextSteps": ["Ship updated exports."],
                "questionsRaised": ["Do we support uncertain speaker filtering?"],
            },
            "bookmarks": [
                {
                    "id": "bm-1",
                    "timeSec": 5.0,
                    "category": "decision",
                    "label": "Pilot cohort date locked",
                    "note": "Confirmed Week 3 rollout.",
                }
            ],
            "actionItems": [
                {
                    "id": "act-1",
                    "task": "Send revised order form",
                    "owner": "Priya",
                    "deadline": "Friday",
                    "timestampSec": 5.0,
                    "completed": False,
                }
            ],
            "transcript": [
                {
                    "id": "seg-1",
                    "start": 0.0,
                    "end": 4.5,
                    "speakerId": "spk-1",
                    "text": "Welcome everyone to the Q4 renewal call.",
                    "confidence": 0.94,
                    "uncertain": False,
                },
                {
                    "id": "seg-2",
                    "start": 5.0,
                    "end": 11.25,
                    "speakerId": "spk-2",
                    "text": "Thanks! Let us finalize the Week 3 pilot cohort.",
                    "confidence": 0.41,
                    "uncertain": True,
                },
            ],
        },
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["summary"] == "Edited executive summary verified by user."
    assert updated["analysis"]["questionsRaised"] == ["Do we support uncertain speaker filtering?"]
    assert updated["bookmarks"][0]["label"] == "Pilot cohort date locked"
    assert updated["actionItems"][0]["owner"] == "Priya"
    assert updated["transcript"][0]["confidence"] == 0.94
    assert updated["transcript"][1]["uncertain"] is True

    # Verify TXT, MD, DOCX exports include action items, bookmarks, and questions raised
    txt_text = client.get(f"/api/jobs/{job_id}/export?format=txt").text
    assert "ACTION ITEMS" in txt_text
    assert "Send revised order form (Owner: Priya, Due: Friday, @00:05)" in txt_text
    assert "BOOKMARKS" in txt_text
    assert "Pilot cohort date locked" in txt_text
    assert "Do we support uncertain speaker filtering?" in txt_text

    md_text = client.get(f"/api/jobs/{job_id}/export?format=md").text
    assert "## Action Items" in md_text
    assert "## Bookmarks" in md_text
    assert "**Questions Raised:**" in md_text

    docx_bytes = client.get(f"/api/jobs/{job_id}/export?format=docx").content
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as zf:
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "Send revised order form" in xml
        assert "Pilot cohort date locked" in xml

    # Configurable exports: toggle timestamps & speakers independently
    txt_no_spk = client.get(f"/api/jobs/{job_id}/export?format=txt&timestamps=true&speakers=false").text
    assert "[00:00] Welcome everyone to the Q4 renewal call." in txt_no_spk
    assert "[00:00] Speaker 1:" not in txt_no_spk

    txt_no_ts = client.get(f"/api/jobs/{job_id}/export?format=txt&timestamps=false&speakers=true").text
    assert "Speaker 1: Welcome everyone to the Q4 renewal call." in txt_no_ts
    assert "[00:00]" not in txt_no_ts

    md_clean = client.get(f"/api/jobs/{job_id}/export?format=md&timestamps=false&speakers=false").text
    assert "Welcome everyone to the Q4 renewal call." in md_clean
    assert "**[00:00]" not in md_clean
    assert "Speaker 1:" not in md_clean

    docx_clean = client.get(f"/api/jobs/{job_id}/export?format=docx&timestamps=false&speakers=false").content
    with zipfile.ZipFile(io.BytesIO(docx_clean)) as zf:
        xml_clean = zf.read("word/document.xml").decode("utf-8")
        assert "Welcome everyone to the Q4 renewal call." in xml_clean
        assert "[00:00]" not in xml_clean

    pdf_clean_res = client.get(f"/api/jobs/{job_id}/export?format=pdf&timestamps=false&speakers=false")
    assert pdf_clean_res.status_code == 200
    assert pdf_clean_res.content.startswith(b"%PDF")


def test_global_transcript_search_and_capabilities(client: TestClient):
    caps_res = client.get("/api/jobs/capabilities")
    assert caps_res.status_code == 200
    caps = caps_res.json()
    assert "ffmpegAvailable" in caps
    assert "whisperAvailable" in caps
    assert "pyannoteAvailable" in caps

    job_id = _upload_sample_job(client, title="Security & Compliance Call").json()["jobId"]
    _seed_completed_job_content(
        client,
        job_id,
        segments=[
            {
                "segment_id": "seg-1",
                "start_sec": 12.0,
                "end_sec": 18.0,
                "speaker_id": "spk-1",
                "text": "SOC2 Type II attestation audit finishes next Wednesday.",
            }
        ],
    )

    hits_res = client.get("/api/jobs/search?q=attestation")
    assert hits_res.status_code == 200
    hits = hits_res.json()
    assert len(hits) == 1
    assert hits[0]["jobId"] == job_id
    assert hits[0]["jobTitle"] == "Security & Compliance Call"
    assert hits[0]["segmentId"] == "seg-1"
    assert hits[0]["speakerName"] == "Speaker 1"
    assert hits[0]["start"] == 12.0

    short_res = client.get("/api/jobs/search?q=a")
    assert short_res.status_code == 200
    assert short_res.json() == []


def test_cancel_preserves_partial_transcript_and_retry_honors_config(tmp_path: Path):
    # 1. Queued job when AI provider is enabled -> cancel transitions cleanly and keeps partial transcript
    enabled_settings = Settings(
        app_env="test",
        database_url=f"sqlite:///{(tmp_path / 'cancel_retry.db').as_posix()}",
        upload_dir=str(tmp_path / "uploads"),
        ai_provider_enabled=True,
        run_local_worker_on_upload=False,
        cors_origins="http://localhost:3000",
    )
    app = create_app(enabled_settings)
    with TestClient(app) as c:
        job_id = _upload_sample_job(c, title="Long Workshop").json()["jobId"]

        # Simulate partial transcript persisted during transcribing before user clicks Cancel
        patch_partial = c.patch(
            f"/api/jobs/{job_id}",
            json={
                "transcript": [
                    {
                        "id": "seg-partial-1",
                        "start": 0.0,
                        "end": 3.5,
                        "speakerId": "spk-1",
                        "text": "Partial transcript preserved on cancel.",
                    }
                ]
            },
        )
        assert patch_partial.status_code == 200

        cancel_res = c.post(f"/api/jobs/{job_id}/cancel")
        assert cancel_res.status_code == 200
        cancelled_job = cancel_res.json()
        assert cancelled_job["status"] == "cancelled"
        assert cancelled_job["progress"] == 0
        assert len(cancelled_job["transcript"]) == 1
        assert cancelled_job["transcript"][0]["text"] == "Partial transcript preserved on cancel."

        # Retry transitions back to queued
        retry_res = c.post(f"/api/jobs/{job_id}/retry")
        assert retry_res.status_code == 200
        assert retry_res.json()["status"] == "queued"

    # 2. Retry when ai_provider_enabled=False transitions honestly to failed with UNCONFIGURED_TRANSCRIPTION_MESSAGE
    disabled_settings = Settings(
        app_env="test",
        database_url=f"sqlite:///{(tmp_path / 'disabled_retry.db').as_posix()}",
        upload_dir=str(tmp_path / "uploads_disabled"),
        ai_provider_enabled=False,
        cors_origins="http://localhost:3000",
    )
    app_disabled = create_app(disabled_settings)
    with TestClient(app_disabled) as c_dis:
        job_id = _upload_sample_job(c_dis).json()["jobId"]
        assert c_dis.get(f"/api/jobs/{job_id}").json()["status"] == "failed"
        retry_dis = c_dis.post(f"/api/jobs/{job_id}/retry")
        assert retry_dis.status_code == 200
        assert retry_dis.json()["status"] == "failed"
        assert retry_dis.json()["error"] == UNCONFIGURED_TRANSCRIPTION_MESSAGE
