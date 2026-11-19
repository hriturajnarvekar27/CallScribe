# CallScribe Frontend

CallScribe is a React + TypeScript + Tailwind CSS frontend for turning recorded client calls into speaker-labeled transcripts, structured summaries, meeting notes, action items, and client sentiment/risk analysis.

## Mock Mode vs. Real Backend API

All network requests flow through a single API client module (`src/api.ts`) with typed domain models in `src/types.ts`.

- **Mock Mode (Default)**: When `VITE_API_BASE_URL` is empty (and no override is set in **Settings**), `src/api.ts` automatically activates Mock Mode.
  - Includes 6 realistic client calls across `done`, `extracting_audio`, `queued`, and `failed` states, including a 45-minute kickoff call with 46 segments and Hindi/Marathi Devanagari transcripts.
  - Uploading a new recording simulates XHR upload progress and advances the job through `queued → extracting_audio → transcribing → analyzing → done` over ~15 seconds.
  - Edits, speaker renames, action item toggles, regenerations, and exports (`docx`, `pdf`, `md`, `txt`, `srt`) work locally in-session.
- **Live Backend Mode**: Set `VITE_API_BASE_URL` in `.env` (or `.env.local`):
  ```bash
  VITE_API_BASE_URL=https://api.your-backend.com
  ```
  You can also test a backend endpoint at runtime without rebuilding by entering an **API base URL** in the **Settings** screen (stored in `localStorage`).

## Backend REST API Contract

`src/api.ts` targets these exact endpoints:

- `POST /api/jobs` — `multipart/form-data` (`file`, `title`, `language`, `speakers`, `outputs` JSON, `context`) via `XMLHttpRequest` for upload progress -> `{ jobId }`
- `GET /api/jobs` — returns `Job[]` (list view without `transcript`)
- `GET /api/jobs/{id}` — returns full `Job`
- `PATCH /api/jobs/{id}` — updates `{ title, speakers, transcript, notes, actionItems }` -> `Job`
- `POST /api/jobs/{id}/regenerate` — `{ section: "summary" | "notes" | "actionItems" | "analysis" }` -> `Job`
- `GET /api/jobs/{id}/export?format=docx|pdf|md|txt|srt` — triggers file download
- `DELETE /api/jobs/{id}` — deletes a job

## Polling & Future SSE Swap

Active job polling is isolated in `src/hooks/useJobPolling.ts`, which polls `GET /api/jobs/{id}` every 2 seconds while `status` is not `done` or `failed`. To upgrade to Server-Sent Events (`EventSource`), replace the interval inside `useJobPolling.ts` without modifying UI components.
