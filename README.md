# CallScribe Frontend

CallScribe is a React + TypeScript + Tailwind CSS frontend for turning recorded audio and video calls into speaker-labeled transcripts, structured summaries, meeting notes, sentiment/risk analysis, and exportable subtitles (`.srt` / `.vtt`).

## Mock Mode vs. Live Backend Mode

All network requests flow through a single API client module (`src/api.ts`) backed by strict TypeScript domain models in `src/types.ts`.

- **Mock Mode (Default)**: Active only when both `VITE_API_BASE_URL` and the **Settings** endpoint override are empty.
  - Includes 9 realistic sample recordings across `done`, `transcribing`, `queued`, and `failed` states, including a 45-minute kickoff call with 46 segments and Hindi/Marathi Devanagari transcripts.
  - Two active jobs advance automatically in real time, and new uploads simulate XHR upload progress + `queued → extracting_audio → transcribing → analyzing → done` lifecycle transitions.
  - Transcript edits, speaker renames, note updates, pin/tag updates, regenerations, and exports (`docx`, `pdf`, `md`, `txt`, `srt`, `vtt`) run in-session.
- **Live Backend Mode**: Set `VITE_API_BASE_URL` in `.env` (or `.env.local`), or configure an **API base URL** override in **Settings** (`http://` or `https://`):
  ```env
  VITE_API_BASE_URL=https://api.your-backend.com
  ```
  - Live Mode **never** silently falls back to Mock Mode on network errors or invalid configuration.

## FastAPI Backend REST API Contract

`src/api.ts` targets these endpoints:

### 1. `POST /api/jobs`
- **Request**: `multipart/form-data` (sent via `XMLHttpRequest` for upload progress and cancellation)
  - `file`: binary media file (`.mp4`, `.mov`, `.mkv`, `.webm`, `.mp3`, `.m4a`, `.wav`, max 2 GB client validation)
  - `title`: `string`
  - `language`: `string` (`"auto"`, `"en"`, `"hi"`, `"mr"`, `"es"`, `"fr"`, `"de"`, `"ja"`)
  - `speakers`: `string` (`"auto"`, `"2"`, `"3"`, `"4+"`)
  - `outputs`: JSON-encoded `OutputSelections` (`{ "summary": boolean, "notes": boolean, "analysis": boolean, "subtitles": boolean }`)
  - `context`: `string`
- **Response (`200` / `201`)**: `{ "jobId": string }`
- **Limitation**: Native browser `XMLHttpRequest` streams cannot be paused mid-transfer; Live HTTP uploads support **Cancel** and **Retry** (Pause is enabled only in Mock Mode).

### 2. `GET /api/jobs`
- **Response (`200`)**: `Job[]` (list view; `transcript` may be omitted for list performance)

### 3. `GET /api/jobs/{id}`
- **Response (`200`)**: Full `Job` object:
  - `id`, `title`, `createdAt` (ISO-8601), `durationSec`, `language`
  - `status`: `"queued" | "extracting_audio" | "transcribing" | "analyzing" | "done" | "failed"`
  - `progress`: `number` (`0–100`)
  - `error?`: `string` (displayed when `status === "failed"`)
  - `audioUrl?`: `string` (absolute URL or root-relative path resolved against API base URL)
  - `client?`, `tags?`, `pinned?`
  - `speakers`: `Array<{ id: string, name: string, color: string }>`
  - `transcript?`: `Array<{ id: string, start: number, end: number, speakerId: string, text: string }>`
  - `summary?`: `string`, `keyPoints?`: `string[]`
  - `notes?`: `Array<{ heading: string, bullets: string[] }>`
  - `analysis?`: `{ sentiment: "positive" | "neutral" | "negative", sentimentNote: string, topics: string[], decisions: string[], concerns: string[], risks: string[], nextSteps: string[] }`

### 4. `PATCH /api/jobs/{id}`
- **Request**: JSON partial object containing any subset of:
  `{ title, speakers, transcript, notes, pinned, client, tags }`
- **Response (`200`)**: Updated `Job`

### 5. `POST /api/jobs/{id}/regenerate`
- **Request**: `{ "section": "summary" | "notes" | "analysis" }` (failed/bulk job retry in `reprocessJob` sends `{ "section": "summary" }`)
- **Response (`200`)**: Updated `Job`

### 6. `GET /api/jobs/{id}/export`
- **Query parameters**:
  - `format`: `"docx" | "pdf" | "md" | "txt" | "srt" | "vtt"`
  - `speakers`: `"true" | "false"` (sent for `srt` and `vtt`)
  - `offsetSec`: `number` (optional cue timing offset in seconds for `srt` and `vtt`)
- **Response (`200`)**: Binary/text file stream with `Content-Disposition: attachment; filename="..."` (or RFC 5987 `filename*=UTF-8''...`).
- **CORS requirement**: FastAPI CORS middleware must include `expose_headers=["Content-Disposition"]` for cross-origin filename detection.

### 7. `GET /api/jobs/{id}/audio`
- **Query parameters**:
  - `format`: `"mp3" | "wav"`
- **Response (`200`)**: Extracted or streamed audio file (`audio/mpeg` or `audio/wav`) with `Content-Disposition: attachment; filename="..."`.

### 8. `DELETE /api/jobs/{id}`
- **Response (`200` / `204`)**: Empty or status confirmation.

### Error Responses
`src/api.ts` parses standard FastAPI error payloads (`{ "detail": string }` and `422` Pydantic validation arrays `detail: [{ loc, msg }]`) as well as `{ "error": string }` / `{ "message": string }` for HTTP `400`, `404`, `413`, `422`, and `500+` responses without exposing raw HTML error pages or backend stack traces.

## Polling & Future SSE Swap

Active job polling is isolated in `src/hooks/useJobPolling.ts`, which polls `GET /api/jobs/{id}` every 2 seconds while `status` is processing (`queued`, `extracting_audio`, `transcribing`, `analyzing`), deduplicates in-flight requests, aborts on unmount, tolerates temporary network drops, and stops automatically once a job reaches `done` or `failed`. To upgrade to Server-Sent Events (`EventSource`), replace the interval inside `useJobPolling.ts` without modifying UI components.

