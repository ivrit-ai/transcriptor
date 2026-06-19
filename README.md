# Transcriptor

Crowdsourced Hebrew handwriting transcription platform. Volunteers see crops of scanned manuscript lines and type what they read. Each line is collected from 3 independent volunteers before being considered complete.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL |
| Frontend | React 18, TypeScript, Vite, React Router 6, CSS Modules |
| Package mgr (Python) | `uv` |
| Package mgr (JS) | `npm` |

---

## Prerequisites

- Python 3.12+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+
- PostgreSQL 15+ running locally (default: `localhost:5432`)

---

## Running locally

### 1 — Environment

Copy `.env.example` to `.env` and adjust if needed. The only required change for local dev is confirming the database URL:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transcriptor
DEV_MODE=true
```

`DEV_MODE=true` enables:
- Auto-creation of a fixed dev user (`dev@localhost`, `google_sub: dev-user-001`) on every request — no OAuth required
- CORS for `http://localhost:5173`
- Static file serving of `data_sample/` at `/images`

### 2 — Database

```bash
# Create the database (once)
createdb transcriptor

# Apply migrations
uv run alembic upgrade head
```

### 3 — Seed dev data

```bash
uv run python scripts/seed_dev.py
```

Inserts batch `dev-batch-001` with 1 page and 3 line crops from `data_sample/OIP-4077272563.jpg`.

### 4 — Start the backend

```bash
uv run uvicorn app.main:app --reload --reload-exclude "frontend"
```

Listens on `http://localhost:8000`.

### 5 — Start the frontend

```bash
cd frontend
npm install   # first time only
npm run dev
```

Opens at `http://localhost:5173`. The Vite dev proxy forwards `/api/*` and `/images/*` to `localhost:8000`.

---

## Deploy

Deployment targets the xhostd platform, which exposes a plain git endpoint. The
deploy script builds the frontend and force-pushes a single fresh commit
containing the runtime app to the deploy branch.

```bash
python scripts/deploy.py            # build frontend + deploy
python scripts/deploy.py --dry-run  # build + assemble, but don't push
python scripts/deploy.py --skip-build  # reuse existing frontend/dist
```

What gets deployed:

- **Backend**: all git-tracked files under `app/`, `alembic/`, `scripts/`, plus
  `alembic.ini`, `install.sh`, `launch.sh`, `pyproject.toml`, `uv.lock`. New
  files are picked up automatically (via `git ls-files`) — there is no hardcoded
  list to maintain.
- **Frontend**: the freshly built `frontend/dist/**`, with its directory layout
  preserved (the server serves it from `frontend/dist`, see `app/main.py`).
- Dev-only paths (`tests/`, `planning/`, docs, `data*/`) are excluded.

Notes:

- The deploy repo's history is independent of `origin`; each deploy replaces the
  branch tip with one clean commit (force-push).
- **Auth** is handled by your local git credential manager — the same way a
  normal `git push` to that host authenticates. No tokens live in the repo.
- Config via env / `.env`: `XHOST_GIT_URL`, `XHOST_GIT_BRANCH` (see
  `.env.example`).

---

## Input

Transcriptor does not run OCR itself. It consumes pre-segmented line data produced by a detector such as [Surya](https://github.com/VikParuchuri/surya).

### Import a batch

```bash
uv run python scripts/import_batch.py <batch_id> <source> <license> <surya_json_path>
```

| Argument | Example | Meaning |
|----------|---------|---------|
| `batch_id` | `cairo-geniza-001` | Stable external identifier for this batch |
| `source` | `NLI` | Data source label |
| `license` | `public-domain` | License for the source images |
| `surya_json_path` | `data/batch.json` | Path to Surya JSON (see format below) |

**Surya JSON format:**

```json
{
  "pages": [
    {
      "page_id": "ms-001-fol-1r",
      "image_path": "images/ms-001-fol-1r.jpg",
      "width": 2480,
      "height": 3508,
      "text_lines": [
        {
          "bbox": {"x": 120, "y": 80, "w": 2240, "h": 90},
          "polygon": [[120, 80], [2360, 80], [2360, 170], [120, 170]],
          "confidence": 0.97
        }
      ]
    }
  ]
}
```

- `image_path` may be a filename (served from `data_sample/` in dev) or a full `https://` URL.
- `polygon` and `confidence` are optional.
- Re-importing the same batch is idempotent (upserts on external IDs).

---

## Output

### Export transcriptions

```bash
uv run python scripts/export_dataset.py output.jsonl
# or pipe to stdout:
uv run python scripts/export_dataset.py
```

Produces one JSON object per line, including all transcriptions collected so far:

```json
{
  "line_id": "abc123...",
  "external_id": "sha256...",
  "line_index": 0,
  "bbox": {"x": 120, "y": 80, "w": 2240, "h": 90},
  "polygon": null,
  "page": {
    "external_id": "ms-001-fol-1r",
    "image_path": "images/ms-001-fol-1r.jpg",
    "width_px": 2480,
    "height_px": 3508
  },
  "batch": {"source": "NLI", "license": "public-domain"},
  "transcription_count": 3,
  "transcriptions": [
    {"kind": "text", "text": "וּבַיּוֹם הַשְּׁלִישִׁי", "created_at": "2025-01-15T10:22:00Z"},
    {"kind": "text", "text": "ובְּיוֹם הַשְּׁלִישִׁי", "created_at": "2025-01-15T11:05:00Z"},
    {"kind": "cant_read", "text": null, "created_at": "2025-01-15T12:30:00Z"}
  ]
}
```

Lines with no transcriptions are included. The `transcriptions` array reflects the append-truth model — disagreements are preserved for offline adjudication.

### Export telemetry

```bash
uv run python scripts/export_telemetry.py events.jsonl
```

Produces one JSON object per event (submissions, edits, etc.) for analytics.

---

## API reference

All routes are prefixed `/api`. Auth is via `Authorization: Bearer <google-id-token>` (or automatic in `DEV_MODE`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/next-session` | consent required | Next page + lines to transcribe. Returns `204` when nothing is left. |
| `POST` | `/api/lines/{line_id}/response` | consent required | Submit a transcription or flag for a line. |
| `POST` | `/api/consent` | required | Record consent (contribution license or telemetry). |
| `GET` | `/api/me/progress` | required | Caller's total text transcription count. |
| `GET` | `/api/leaderboard` | none | Top 100 contributors. |
| `GET` | `/health` | none | `{"status": "ok"}` |

### POST /api/lines/{line_id}/response

**Request body:**

```json
{"kind": "text", "text": "וּבַיּוֹם הַשְּׁלִישִׁי"}
```

`kind` must be one of: `text | cant_read | bad_crop | not_hebrew | not_text`.  
`text` is required when `kind = "text"`, must be omitted (or null) otherwise.

**Response:**

```json
{"transcription_id": "uuid", "is_edit": false, "transcription_count": 2}
```

---

## Dispatch logic

`GET /api/next-session` returns the page with the most lines still eligible for the requesting user. A line is eligible if:

1. The user has not yet responded to it, **and**
2. `transcription_count < 3` (configurable target)

Once a page has no more eligible lines, the next best page is returned. When no pages remain, the endpoint returns `204 No Content`.

---

## Consent

Before accessing `/work` the user must accept the contribution license consent (`consent_type: contribution_license`). The current version is controlled by the `CONSENT_VERSION` env var (default `1.0`). Changing this value requires all users to re-consent.

---

## Project structure

```
transcriptor/
├── app/
│   ├── api/routes/          # FastAPI routers (session, transcription, consent, progress, leaderboard)
│   ├── models/              # SQLAlchemy models (Batch, Page, Line, User, Transcription, Consent, Event)
│   ├── services/            # Business logic (dispatch, transcriptions, consent, leaderboard, users)
│   ├── config.py            # Pydantic settings
│   ├── db.py                # Engine + SessionLocal
│   ├── main.py              # App factory
│   └── storage.py           # Image URL resolver
├── frontend/
│   ├── src/
│   │   ├── screens/         # LoginScreen, ConsentScreen, WorkScreen, DoneScreen, MeScreen
│   │   ├── components/      # LineStrip, TranscriptionInput, ActionBar, FlagPopover, ...
│   │   ├── guards/          # AuthGuard, ConsentGuard
│   │   ├── api.ts           # Typed API client
│   │   └── types.ts         # Shared TypeScript types
│   └── vite.config.ts
├── scripts/
│   ├── import_batch.py      # Import Surya JSON → DB
│   ├── export_dataset.py    # Export lines + transcriptions → JSONL
│   ├── export_telemetry.py  # Export events → JSONL
│   └── seed_dev.py          # Insert hardcoded dev data
├── alembic/versions/        # DB migrations
├── .env.example
├── WORKPLAN.md              # Backend design spec
└── FRONTEND_SPEC.md         # Frontend design spec
```

---

## Design notes

- **Append-truth:** transcriptions are never deleted; edits are in-place upserts (one row per user per line). Disagreements are resolved offline.
- **`transcription_count` is a cached counter** on `Line`, incremented once per user per line (not per edit). Do not recompute from `COUNT(transcriptions)` in hot paths.
- **No consensus in the app.** The platform collects independent responses and exports them. Normalization, voting, and quality filtering happen in downstream scripts.
- **Vite proxy:** `vite.config.ts` must list every backend path prefix. Currently `/api` and `/images`. Adding a new FastAPI mount requires a matching proxy entry.
