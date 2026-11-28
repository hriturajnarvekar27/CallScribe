from __future__ import annotations

import io
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select

from app.config import Settings
from app.main import create_app
from app.models import JobModel, SpeakerModel, TranscriptSegmentModel
from app.services.ai_pipeline import UNCONFIGURED_TRANSCRIPTION_MESSAGE


def _upload_sample_job(
    client: TestClient,
    *,
    filename: str = "q4_review.mp4",
    content: bytes = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    content_type: str = "video/mp4",
    title: str = "Q4 Enterprise Review",
    language: str = "en",
    speakers: str = "2",
    outputs: dict | None = None,
    context: str = "Focus on renewal terms",
):
    outputs_payload = outputs or {
        "summary": True,
        "notes": True,
        "analysis": True,
        "subtitles": True,
    }
    return client.post(
        "/api/jobs",
        files={"file": (filename, content, content_type)},
        data={
            "title": title,
            "language": language,
            "speakers": speakers,
            "outputs": json.dumps(outputs_payload),
            "context": context,
        },
    )


def _seed_completed_job_content(
    client: TestClient,
    job_id: str,
    *,
    summary: str = "Aligned on annual renewal terms and pilot rollout dates.",
    key_points: list[str] | None = None,
    notes: list[dict] | None = None,
    analysis: dict | None = None,
    segments: list[dict] | None = None,
) -> None:
    """Populate realistic transcript/insights directly in SQLite to test PATCH, regenerate, and export."""
    session_factory = client.app.state.session_factory
    with session_factory() as db:
        job = db.scalars(select(JobModel).where(JobModel.id == job_id)).first()
        assert job is not None
        job.status = "done"
        job.progress = 100
        job.error = None
        job.duration_sec = 125.0
        job.summary = summary
        job.key_points_json = json.dumps(
            key_points
            or [
                "Pilot launch locked for Week 3.",
                "18% volume discount approved for 45 seats.",
            ]
        )
        job.notes_json = json.dumps(
            notes
            or [
                {
                    "heading": "Commercial Terms",
                    "bullets": ["Annual billing cycle starts Dec 1.", "Security review tomorrow."],
                }
            ]
        )
        job.analysis_json = json.dumps(
            analysis
            or {
                "sentiment": "positive",
                "sentimentNote": "Strong alignment across both teams.",
                "topics": ["Renewal", "Onboarding"],
                "decisions": ["Proceed with Week 3 pilot."],
                "concerns": ["Finance sign-off timing."],
                "risks": ["PO delay may shift rollout by 3 days."],
                "nextSteps": ["Send updated order form."],
            }
        )
        if not job.speakers:
            job.speakers = [
                SpeakerModel(speaker_id="spk-1", name="Speaker 1", color="#6366F1", position=0),
                SpeakerModel(speaker_id="spk-2", name="Speaker 2", color="#06B6D4", position=1),
            ]
        seg_defs = segments or [
            {
                "segment_id": "seg-1",
                "start_sec": 0.0,
                "end_sec": 4.5,
                "speaker_id": "spk-1",
                "text": "Welcome everyone to the Q4 renewal call.",
            },
            {
                "segment_id": "seg-2",
                "start_sec": 5.0,
                "end_sec": 11.25,
                "speaker_id": "spk-2",
                "text": "Thanks! Let us finalize the Week 3 pilot cohort.",
            },
        ]
        job.segments = [
            TranscriptSegmentModel(
                segment_id=s["segment_id"],
                start_sec=s["start_sec"],
                end_sec=s["end_sec"],
                speaker_id=s["speaker_id"],
                text=s["text"],
                position=idx,
            )
            for idx, s in enumerate(seg_defs)
        ]
        db.commit()


def test_health_and_cors_headers(client: TestClient):
    res = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "connected", "storage": "ready"}
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "Content-Disposition" in (res.headers.get("access-control-expose-headers") or "")

    preflight = client.options(
        "/api/jobs",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "PATCH",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_upload_transitions_to_terminal_failed_when_ai_disabled_and_keeps_media(
    client: TestClient, test_settings: Settings
):
    payload = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    upload_res = _upload_sample_job(client, content=payload)
    assert upload_res.status_code == 201
    body = upload_res.json()
    assert "jobId" in body and body["jobId"].startswith("job-")
    job_id = body["jobId"]

    stored_files = list(Path(test_settings.upload_dir).iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].name.startswith(f"{job_id}_")
    assert stored_files[0].read_bytes() == payload

    expected_audio_url = f"/api/jobs/{job_id}/media"

    # List endpoint omits transcript and includes audioUrl + terminal failed status
    list_res = client.get("/api/jobs")
    assert list_res.status_code == 200
    jobs = list_res.json()
    assert len(jobs) == 1
    assert jobs[0]["id"] == job_id
    assert jobs[0]["status"] == "failed"
    assert jobs[0]["progress"] == 0
    assert jobs[0]["error"] == UNCONFIGURED_TRANSCRIPTION_MESSAGE
    assert jobs[0]["audioUrl"] == expected_audio_url
    assert "transcript" not in jobs[0]
    assert "summary" not in jobs[0]

    # Detail endpoint returns complete Job object with audioUrl and empty transcript
    detail_res = client.get(f"/api/jobs/{job_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == job_id
    assert detail["status"] == "failed"
    assert detail["error"] == UNCONFIGURED_TRANSCRIPTION_MESSAGE
    assert detail["audioUrl"] == expected_audio_url
    assert detail["transcript"] == []

    missing_res = client.get("/api/jobs/job-does-not-exist")
    assert missing_res.status_code == 404


def test_upload_remains_queued_when_ai_provider_enabled(tmp_path: Path):
    enabled_settings = Settings(
        app_env="test",
        database_url=f"sqlite:///{(tmp_path / 'enabled.db').as_posix()}",
        upload_dir=str(tmp_path / "uploads"),
        ai_provider_enabled=True,
        cors_origins="http://localhost:3000",
    )
    app = create_app(enabled_settings)
    with TestClient(app) as c:
        job_id = _upload_sample_job(c).json()["jobId"]
        detail = c.get(f"/api/jobs/{job_id}").json()
        assert detail["status"] == "queued"
        assert detail["progress"] == 0
        assert "error" not in detail
        assert detail["audioUrl"] == f"/api/jobs/{job_id}/media"


def test_audio_playback_range_seeking_and_missing_files(client: TestClient, test_settings: Settings):
    media_bytes = b"RIFF" + bytes(range(64)) + b"END-MEDIA"
    job_id = _upload_sample_job(
        client,
        filename="client_call.wav",
        content=media_bytes,
        content_type="audio/wav",
        title="Client Audio Call",
    ).json()["jobId"]

    detail = client.get(f"/api/jobs/{job_id}").json()
    media_url = detail["audioUrl"]
    assert media_url == f"/api/jobs/{job_id}/media"

    # 1. Full playback (200 OK)
    full_res = client.get(media_url)
    assert full_res.status_code == 200
    assert full_res.content == media_bytes
    assert full_res.headers["content-type"].startswith("audio/wav")
    assert full_res.headers["accept-ranges"] == "bytes"
    assert full_res.headers["content-length"] == str(len(media_bytes))
    assert full_res.headers["content-disposition"].startswith("inline;")

    # 2. Range request from start (206 Partial Content)
    r1 = client.get(media_url, headers={"Range": "bytes=0-9"})
    assert r1.status_code == 206
    assert r1.content == media_bytes[0:10]
    assert r1.headers["content-range"] == f"bytes 0-9/{len(media_bytes)}"
    assert r1.headers["accept-ranges"] == "bytes"
    assert r1.headers["content-length"] == "10"

    # 3. Seeking forward and backward across byte offsets
    seek_fwd = client.get(media_url, headers={"Range": "bytes=32-47"})
    assert seek_fwd.status_code == 206
    assert seek_fwd.content == media_bytes[32:48]
    assert seek_fwd.headers["content-range"] == f"bytes 32-47/{len(media_bytes)}"

    seek_back = client.get(media_url, headers={"Range": "bytes=4-15"})
    assert seek_back.status_code == 206
    assert seek_back.content == media_bytes[4:16]

    # 4. Open-ended and suffix ranges
    tail_open = client.get(media_url, headers={"Range": "bytes=68-"})
    assert tail_open.status_code == 206
    assert tail_open.content == media_bytes[68:]

    suffix = client.get(media_url, headers={"Range": "bytes=-9"})
    assert suffix.status_code == 206
    assert suffix.content == b"END-MEDIA"

    # 5. Unsatisfiable range -> 416
    bad_range = client.get(media_url, headers={"Range": "bytes=99999-"})
    assert bad_range.status_code == 416
    assert bad_range.headers["content-range"] == f"bytes */{len(media_bytes)}"

    # 6. Missing job -> 404
    assert client.get("/api/jobs/job-missing/media").status_code == 404

    # 7. Missing file on disk -> 404
    for f in Path(test_settings.upload_dir).iterdir():
        f.unlink()
    missing_file_res = client.get(media_url)
    assert missing_file_res.status_code == 404


def test_partial_update_preserves_segment_ids_timestamps_and_speaker_ids(client: TestClient):
    job_id = _upload_sample_job(client).json()["jobId"]
    _seed_completed_job_content(client, job_id)

    meta_res = client.patch(
        f"/api/jobs/{job_id}",
        json={
            "title": "Q4 Renewal Final",
            "pinned": True,
            "client": "Northstar Retail",
            "tags": ["renewal", "enterprise"],
        },
    )
    assert meta_res.status_code == 200
    meta_job = meta_res.json()
    assert meta_job["title"] == "Q4 Renewal Final"
    assert meta_job["pinned"] is True
    assert meta_job["client"] == "Northstar Retail"
    assert meta_job["tags"] == ["renewal", "enterprise"]
    assert meta_job["audioUrl"] == f"/api/jobs/{job_id}/media"
    assert meta_job["summary"] == "Aligned on annual renewal terms and pilot rollout dates."
    assert len(meta_job["transcript"]) == 2

    seg_res = client.patch(
        f"/api/jobs/{job_id}",
        json={
            "transcript": [
                {
                    "id": "seg-1",
                    "start": 0.0,
                    "end": 4.5,
                    "speakerId": "spk-1",
                    "text": "Welcome everyone to the updated Q4 renewal call.",
                },
                {
                    "id": "seg-2",
                    "text": "Thanks! Let us lock the Week 3 pilot cohort.",
                },
            ]
        },
    )
    assert seg_res.status_code == 200
    segs = seg_res.json()["transcript"]
    assert segs[0]["id"] == "seg-1"
    assert segs[0]["start"] == 0.0
    assert segs[0]["end"] == 4.5
    assert segs[0]["speakerId"] == "spk-1"
    assert segs[0]["text"] == "Welcome everyone to the updated Q4 renewal call."

    assert segs[1]["id"] == "seg-2"
    assert segs[1]["start"] == 5.0
    assert segs[1]["end"] == 11.25
    assert segs[1]["speakerId"] == "spk-2"
    assert segs[1]["text"] == "Thanks! Let us lock the Week 3 pilot cohort."

    bad_seg_res = client.patch(
        f"/api/jobs/{job_id}",
        json={
            "transcript": [
                {
                    "id": "seg-1",
                    "start": 10.0,
                    "end": 2.0,
                    "speakerId": "spk-1",
                    "text": "Invalid timing",
                }
            ]
        },
    )
    assert bad_seg_res.status_code == 422


def test_speaker_rename_preserves_ids_and_colors(client: TestClient):
    job_id = _upload_sample_job(client, speakers="2").json()["jobId"]
    before = client.get(f"/api/jobs/{job_id}").json()["speakers"]
    assert before == [
        {"id": "spk-1", "name": "Speaker 1", "color": "#6366F1"},
        {"id": "spk-2", "name": "Speaker 2", "color": "#06B6D4"},
    ]

    patch_res = client.patch(
        f"/api/jobs/{job_id}",
        json={
            "speakers": [
                {"id": "spk-1", "name": "Maya Lin"},
                {"id": "spk-2", "name": "Liam Carter", "color": "#06B6D4"},
            ]
        },
    )
    assert patch_res.status_code == 200
    after = patch_res.json()["speakers"]
    assert after == [
        {"id": "spk-1", "name": "Maya Lin", "color": "#6366F1"},
        {"id": "spk-2", "name": "Liam Carter", "color": "#06B6D4"},
    ]


def test_regeneration_returns_501_when_unavailable_and_preserves_existing_data(
    client: TestClient,
):
    job_id = _upload_sample_job(client).json()["jobId"]
    original_summary = "Original verified summary."
    original_notes = [{"heading": "Verified Notes", "bullets": ["Keep this intact."]}]
    _seed_completed_job_content(
        client,
        job_id,
        summary=original_summary,
        notes=original_notes,
    )

    for section in ("summary", "notes", "analysis"):
        res = client.post(f"/api/jobs/{job_id}/regenerate", json={"section": section})
        assert res.status_code == 501
        detail = res.json()["detail"]
        assert section in detail
        assert "not configured" in detail.lower()

    # Confirm existing summary, notes, analysis, and status remain completely unchanged
    after = client.get(f"/api/jobs/{job_id}").json()
    assert after["status"] == "done"
    assert after["summary"] == original_summary
    assert after["notes"] == original_notes
    assert after["analysis"]["sentiment"] == "positive"

    # Invalid section rejected with 422 before hitting provider
    bad_res = client.post(f"/api/jobs/{job_id}/regenerate", json={"section": "transcript"})
    assert bad_res.status_code == 422

    # Nonexistent job returns 404
    missing_res = client.post("/api/jobs/job-missing/regenerate", json={"section": "summary"})
    assert missing_res.status_code == 404


def test_export_all_six_formats_and_subtitle_params(client: TestClient):
    job_id = _upload_sample_job(client, title="Client Sync & Subtitles").json()["jobId"]
    _seed_completed_job_content(client, job_id)
    client.patch(
        f"/api/jobs/{job_id}",
        json={
            "speakers": [
                {"id": "spk-1", "name": "Priya Deshmukh", "color": "#6366F1"},
                {"id": "spk-2", "name": "Vikram Rao", "color": "#06B6D4"},
            ]
        },
    )

    txt_res = client.get(f"/api/jobs/{job_id}/export?format=txt")
    assert txt_res.status_code == 200
    assert "Client Sync & Subtitles" in txt_res.text
    assert "Priya Deshmukh:" not in txt_res.text
    assert "Welcome everyone to the Q4 renewal call." in txt_res.text
    assert 'filename="client-sync-subtitles.txt"' in txt_res.headers["content-disposition"]

    txt_spk_res = client.get(f"/api/jobs/{job_id}/export?format=txt&speakers=true")
    assert txt_spk_res.status_code == 200
    assert "Priya Deshmukh: Welcome everyone" in txt_spk_res.text

    md_res = client.get(f"/api/jobs/{job_id}/export?format=md")
    assert md_res.status_code == 200
    assert "# Client Sync & Subtitles" in md_res.text
    assert "## Summary" in md_res.text

    srt_res = client.get(f"/api/jobs/{job_id}/export?format=srt&speakers=true&offsetSec=2.5")
    assert srt_res.status_code == 200
    assert "00:00:02,500 --> 00:00:07,000" in srt_res.text
    assert "Priya Deshmukh: Welcome everyone to the Q4 renewal call." in srt_res.text

    vtt_res = client.get(f"/api/jobs/{job_id}/export?format=vtt&speakers=false&offsetSec=0")
    assert vtt_res.status_code == 200
    assert vtt_res.text.startswith("WEBVTT\n\n")
    assert "00:00:00.000 --> 00:00:04.500" in vtt_res.text
    assert "Priya Deshmukh:" not in vtt_res.text
    assert "Welcome everyone to the Q4 renewal call." in vtt_res.text

    docx_res = client.get(f"/api/jobs/{job_id}/export?format=docx")
    assert docx_res.status_code == 200
    assert docx_res.content[:2] == b"PK"
    with zipfile.ZipFile(io.BytesIO(docx_res.content)) as zf:
        assert "word/document.xml" in zf.namelist()

    pdf_res = client.get(f"/api/jobs/{job_id}/export?format=pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF-")

    bad_fmt = client.get(f"/api/jobs/{job_id}/export?format=csv")
    assert bad_fmt.status_code == 422


def test_pdf_export_preserves_english_hindi_and_marathi_unicode(client: TestClient):
    title = "Multilingual Review - हिंदी आणि मराठी"
    hindi_text = "नमस्ते, आज हम तिमाही समीक्षा और उत्पाद योजना पर चर्चा करेंगे।"
    marathi_text = "पुणे आणि मुंबई शाखांसाठी ४५ नवीन परवाने मंजूर करण्यात आले आहेत."

    job_id = _upload_sample_job(client, title=title, language="mr").json()["jobId"]
    _seed_completed_job_content(
        client,
        job_id,
        summary=f"English executive overview. {hindi_text}",
        notes=[{"heading": "मराठी निर्णय", "bullets": [marathi_text]}],
        segments=[
            {
                "segment_id": "seg-hi",
                "start_sec": 0.0,
                "end_sec": 12.0,
                "speaker_id": "spk-1",
                "text": hindi_text,
            },
            {
                "segment_id": "seg-mr",
                "start_sec": 13.0,
                "end_sec": 25.0,
                "speaker_id": "spk-2",
                "text": marathi_text,
            },
        ],
    )

    pdf_res = client.get(f"/api/jobs/{job_id}/export?format=pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF-")

    reader = PdfReader(io.BytesIO(pdf_res.content))
    extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)

    assert "Multilingual Review" in extracted_text
    assert "English executive overview." in extracted_text
    assert "हिंदी आणि मराठी" in extracted_text
    assert "नमस्ते" in extracted_text
    assert "तिमाही समीक्षा" in extracted_text
    assert "पुणे आणि मुंबई शाखांसाठी ४५ नवीन परवाने" in extracted_text


def test_delete_job_removes_record_and_file(client: TestClient, test_settings: Settings):
    job_id = _upload_sample_job(client).json()["jobId"]
    upload_dir = Path(test_settings.upload_dir)
    assert len(list(upload_dir.iterdir())) == 1

    del_res = client.delete(f"/api/jobs/{job_id}")
    assert del_res.status_code == 204
    assert list(upload_dir.iterdir()) == []

    assert client.get(f"/api/jobs/{job_id}").status_code == 404
    assert client.get(f"/api/jobs/{job_id}/media").status_code == 404
    assert client.delete(f"/api/jobs/{job_id}").status_code == 404


def test_invalid_file_uploads_rejected_cleanly(client: TestClient, test_settings: Settings):
    upload_dir = Path(test_settings.upload_dir)

    bad_ext = _upload_sample_job(
        client,
        filename="payload.exe",
        content=b"MZ-binary",
        content_type="application/x-msdownload",
    )
    assert bad_ext.status_code == 400

    empty_res = _upload_sample_job(
        client,
        filename="empty.mp3",
        content=b"",
        content_type="audio/mpeg",
    )
    assert empty_res.status_code == 400

    traversal_res = _upload_sample_job(
        client,
        filename="../../etc/passwd.mp4",
        content=b"fake-data",
        content_type="video/mp4",
    )
    assert traversal_res.status_code == 400

    oversize_bytes = b"0" * (test_settings.max_upload_bytes + 1024)
    big_res = _upload_sample_job(
        client,
        filename="too_big.mp4",
        content=oversize_bytes,
        content_type="video/mp4",
    )
    assert big_res.status_code == 413

    bad_outputs = client.post(
        "/api/jobs",
        files={"file": ("valid.mp3", b"audio-bytes", "audio/mpeg")},
        data={"title": "Test", "outputs": "not-json"},
    )
    assert bad_outputs.status_code == 422

    assert list(upload_dir.iterdir()) == []


def test_persistence_across_application_restarts(test_settings: Settings):
    raw_audio = b"RIFF-wave-bytes-for-restart-check"
    app1 = create_app(test_settings)
    with TestClient(app1) as c1:
        job_id = _upload_sample_job(
            c1,
            filename="board_sync.wav",
            content=raw_audio,
            content_type="audio/wav",
            title="Board Sync",
            language="hi",
            speakers="2",
        ).json()["jobId"]
        _seed_completed_job_content(c1, job_id)
        patch_res = c1.patch(
            f"/api/jobs/{job_id}",
            json={
                "pinned": True,
                "tags": ["board", "q4"],
                "speakers": [
                    {"id": "spk-1", "name": "Aarav Mehta"},
                    {"id": "spk-2", "name": "Neha Kapoor"},
                ],
                "transcript": [
                    {"id": "seg-1", "text": "Edited segment persisted across restart."},
                    {"id": "seg-2", "text": "Confirmed."},
                ],
            },
        )
        assert patch_res.status_code == 200

    restarted_settings = Settings(
        app_env="test",
        database_url=test_settings.database_url,
        upload_dir=test_settings.upload_dir,
        max_upload_bytes=test_settings.max_upload_bytes,
        ai_provider_enabled=test_settings.ai_provider_enabled,
        cors_origins=test_settings.cors_origins,
    )
    app2 = create_app(restarted_settings)
    with TestClient(app2) as c2:
        list_res = c2.get("/api/jobs")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1
        assert list_res.json()[0]["audioUrl"] == f"/api/jobs/{job_id}/media"

        detail_res = c2.get(f"/api/jobs/{job_id}")
        assert detail_res.status_code == 200
        job = detail_res.json()
        assert job["audioUrl"] == f"/api/jobs/{job_id}/media"
        assert job["pinned"] is True
        assert job["tags"] == ["board", "q4"]
        assert job["speakers"] == [
            {"id": "spk-1", "name": "Aarav Mehta", "color": "#6366F1"},
            {"id": "spk-2", "name": "Neha Kapoor", "color": "#06B6D4"},
        ]
        assert job["transcript"][0]["id"] == "seg-1"
        assert job["transcript"][0]["start"] == 0.0
        assert job["transcript"][0]["end"] == 4.5
        assert job["transcript"][0]["speakerId"] == "spk-1"
        assert job["transcript"][0]["text"] == "Edited segment persisted across restart."

        media_res = c2.get(job["audioUrl"])
        assert media_res.status_code == 200
        assert media_res.content == raw_audio

    stored_files = list(Path(test_settings.upload_dir).iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == raw_audio


def test_download_audio_from_video_and_error_cases(client: TestClient, tmp_path: Path):
    ffmpeg_bin = shutil.which("ffmpeg")
    assert ffmpeg_bin is not None

    # Synthesize a real 1-second MP4 containing both H.264/mpeg4 video and AAC audio streams
    av_mp4 = tmp_path / "sample_av.mp4"
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=160x120:d=1",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "mpeg4",
            "-c:a",
            "aac",
            "-shortest",
            str(av_mp4),
        ],
        check=True,
    )

    video_job_id = _upload_sample_job(
        client,
        filename="client_recording.mp4",
        content=av_mp4.read_bytes(),
        content_type="video/mp4",
        title="Client Video Recording",
    ).json()["jobId"]

    # Extract MP3 audio from the uploaded MP4 video
    mp3_res = client.get(f"/api/jobs/{video_job_id}/audio?format=mp3")
    assert mp3_res.status_code == 200
    assert mp3_res.headers["content-type"].startswith("audio/mpeg")
    assert 'filename="client-video-recording.mp3"' in mp3_res.headers["content-disposition"]
    assert len(mp3_res.content) > 500

    # Extract WAV audio from the uploaded MP4 video
    wav_res = client.get(f"/api/jobs/{video_job_id}/audio?format=wav")
    assert wav_res.status_code == 200
    assert wav_res.headers["content-type"].startswith("audio/wav")
    assert 'filename="client-video-recording.wav"' in wav_res.headers["content-disposition"]
    assert wav_res.content[:4] == b"RIFF"

    # Silent video (no audio stream) should return 422 with a clear message
    silent_mp4 = tmp_path / "silent_video.mp4"
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=160x120:d=1",
            "-c:v",
            "mpeg4",
            str(silent_mp4),
        ],
        check=True,
    )
    silent_job_id = _upload_sample_job(
        client,
        filename="silent.mp4",
        content=silent_mp4.read_bytes(),
        content_type="video/mp4",
        title="Silent Video",
    ).json()["jobId"]

    silent_res = client.get(f"/api/jobs/{silent_job_id}/audio?format=mp3")
    assert silent_res.status_code == 422
    assert "audio track" in silent_res.json()["detail"].lower()

    # Missing job returns 404
    missing_res = client.get("/api/jobs/job-does-not-exist/audio?format=mp3")
    assert missing_res.status_code == 404

