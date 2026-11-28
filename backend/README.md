# CallScribe Backend (Phase 1)

Persistent FastAPI + SQLite REST API backend built to match the finalized CallScribe React/TypeScript frontend contract (`../src/types.ts`, `../src/api.ts`, and `../README.md`).

## Architecture

```text
backend/
├── app/
│   ├── assets/fonts/        # Bundled NotoSans + NotoSansDevanagari TTF fonts for Unicode PDF export
│   ├── main.py              # FastAPI app factory, CORS, lifespan DB init, global error handler
│   ├── config.py            # Environment-backed Settings (SQLite URL, upload dir, 2 GB limit, AI_PROVIDER_ENABLED, CORS)
│   ├── logging_config.py    # Structured application logging
│   ├── database.py          # SQLAlchemy SQLite engine (WAL + foreign_keys=ON) & session factory
│   ├── dependencies.py      # FastAPI request dependencies
│   ├── models.py            # SQLAlchemy ORM models (jobs, speakers, transcript_segments)
│   ├── schemas.py           # Strict Pydantic v2 schemas matching src/types.ts
│   ├── routers/
│   │   ├── health.py        # GET /health
│   │   └── jobs.py          # /api/jobs endpoints + GET /api/jobs/{id}/media playback
│   └── services/
│       ├── storage.py       # Private file storage, extension/MIME checks, 2 GB limit, traversal guard
│       ├── jobs_service.py  # Persistent CRUD & partial PATCH logic
│       ├── export_service.py# Real Unicode PDF, DOCX, Markdown, TXT, SRT, VTT exporters
│       └── ai_pipeline.py   # Modular Phase 2 AI provider interfaces (honest terminal failed + 501 when unconfigured)
├── tests/
│   ├── conftest.py
│   └── test_jobs_api.py
├── requirements.txt
├── .env.example
└── .gitignore
```

## Windows PowerShell Setup & Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

If PowerShell blocks script activation, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Running Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -v
```

## Connecting the CallScribe Frontend

1. Start the backend on `http://localhost:8000`.
2. Start the frontend on `http://localhost:3000`.
3. Configure the frontend either via `.env` (`VITE_API_BASE_URL=http://localhost:8000`) or in **Settings -> API endpoint override** (`http://localhost:8000`).
4. FastAPI CORS allows `http://localhost:3000` and exposes `Content-Disposition`.

## Implemented Endpoints

- `GET /health` — Verifies SQLite connectivity and writable private upload storage.
- `POST /api/jobs` — Multipart upload (`file`, `title`, `language`, `speakers`, `outputs`, `context`) returning `201` `{ "jobId": "..." }`. In Phase 1 (`AI_PROVIDER_ENABLED=false`), the recording is stored safely and transitions to terminal `failed` with a clear configuration message so the frontend stops polling.
- `GET /api/jobs` — Returns `Job[]` ordered newest first (omits `transcript` array, includes relative `audioUrl`).
- `GET /api/jobs/{id}` — Returns full `Job` object including `audioUrl`, `speakers`, and ordered `transcript` segments.
- `GET /api/jobs/{id}/media` — Streams the original uploaded audio/video file from private storage with `Accept-Ranges: bytes`, HTTP `206 Partial Content` Range seeking, inferred media MIME type, and `inline` `Content-Disposition`. Returns `404` when the job or media file does not exist and `416` for invalid byte ranges.
- `GET /api/jobs/{id}/audio` — Extracts (via FFmpeg) or streams the audio track (`format=mp3` or `format=wav`) from an uploaded video/audio recording as an attachment download.
- `PATCH /api/jobs/{id}` — True partial update preserving transcript segment IDs/timestamps/speakerIds and speaker IDs/colors.
- `POST /api/jobs/{id}/regenerate` — Validates `section` (`summary` | `notes` | `analysis`) and returns `501 Not Implemented` with a clear `detail` message in Phase 1 while leaving existing intelligence data unchanged.
- `GET /api/jobs/{id}/export` — Streams `docx`, `pdf` (bundled Noto Sans + Noto Sans Devanagari Unicode fonts for English/Hindi/Marathi), `md`, `txt`, `srt`, or `vtt` with `speakers` and `offsetSec` query parameters for subtitles.
- `DELETE /api/jobs/{id}` — Deletes job metadata, cascade children, and stored media file (`204 No Content`).
