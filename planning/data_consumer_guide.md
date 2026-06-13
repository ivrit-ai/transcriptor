# Data Consumer Guide — Transcriptor Worker Output

## Overview

The worker processes handwriting sample submissions (PDFs and images uploaded via a web form) and produces a structured **dataset** in a target folder. Each run produces or updates three kinds of artifacts: CSV manifests, per-submission `metadata.json` (form metadata), and per-page images with their detected text-line geometries.

A minimal working example is available at `data/output/`.

---

## Directory Structure

```
<target-root>/
  submissions.csv              # Master roster of all submissions (one row per submission)
  pages.csv                    # Per-page index (one row per page of every document)
  <submission_uuid>/           # One directory per submission
    metadata.json              # Form metadata extracted from the original submission (see below)
    0_p1.jpg                   # Rendered page image (page 1 of the first uploaded file)
    0_p1.jpg.json              # Detected text-line coordinates for that image
    0_p2.jpg                   # (if the file was a multi-page PDF)
    0_p2.jpg.json
    ...
```

The `<submission_uuid>` is a UUID string (e.g. `50713c8c-d252-4b58-b643-b6834c91f04a`).

---

## Entity Model

The dataset represents four entities with these relationships:

```
Submission 1───* Document 1───* Page 1───* Line
```

| Entity | File / Record | Description |
|--------|--------------|-------------|
| **Submission** | One row in `submissions.csv` + `metadata.json` | A form submission by a single user, containing one or more uploaded document files |
| **Document** | source `desc.json.files[]` | One uploaded file (image or PDF) within a submission (not directly represented in output; document info is embedded in image filenames via the `doc_basename` prefix) |
| **Page** | One row in `pages.csv` + one image file | One rendered page from a document (PDFs yield multiple pages, images yield one) |
| **Line** | One entry in `<image>.json.lines[]` | One detected text line with bounding polygon and confidence |

---

## File Schemas

### `submissions.csv`

| Column | Type | Description |
|--------|------|-------------|
| `submission_id` | string (UUID) | Primary key; matches the directory name |
| `status` | string | `completed`, `failed`, or `pending` |
| `error` | string | Error message if `status=failed`; empty otherwise |

One row per submission. This is the entry point — iterate this file to discover all submissions in the dataset.

### `pages.csv`

| Column | Type | Description |
|--------|------|-------------|
| `submission_id` | string (UUID) | Foreign key into `submissions.csv` |
| `doc_filename` | string | The original stored filename of the document within the submission (e.g. `0.jpg`, `1.pdf`) |
| `page_number` | integer | 1-based page number within that document |
| `status` | string | `completed`, `failed`, or `pending` |
| `error` | string | Error message if `status=failed` |
| `image_filename` | string | Filename of the rendered page image in the submission directory (e.g. `0_p1.jpg`) |
| `lines_filename` | string | Filename of the line-detection JSON (e.g. `0_p1.jpg.json`); empty if not yet processed |

To load all pages for a submission: filter `pages.csv` by `submission_id`.

### `metadata.json` — Form Metadata

Extracted from the `form_metadata` key of the source submission's `desc.json`. Contains the form-submission fields only (not the full `desc.json` which includes file lists, user email, and browser migration info).

| Field | Type | Description |
|-------|------|-------------|
| `decade_written` | string | When the handwriting sample was composed (e.g. `"after_2020"`) |
| `writer_age_range` | string | Age bracket (e.g. `"40_50"`, `"30_40"`) |
| `writer_gender` | string | `"male"` / `"female"` / etc. |
| `native_language` | string | Writer's native language |
| `legibility_score` | integer | Self-rated legibility (1–10) |
| `consent_given` | boolean | Research consent flag |
| `additional_notes` | string | Free-text notes from the form |

### Page Image Files (`<doc>_p<N>.jpg`)

JPEG images rasterized at 300 DPI. Naming convention:

```
{stored_filename_basename}_p{page_number}.jpg
```

Examples:
- `0.jpg` → `0_p1.jpg` (single image, page 1)
- `1.pdf` → `1_p1.jpg`, `1_p2.jpg`, ... (multi-page PDF)

For PDF sources the image is rendered by pyMuPDF (Pixmap). For image sources the original is re-encoded as JPEG. In both cases the image may pass through an optional transform step (currently a no-op; future: deskew, binarization, contrast enhancement).

### Lines JSON (`<image>.json`)

One JSON file per page. Structure:

```jsonc
{
  "submission_id": "50713c8c-d252-4b58-b643-b6834c91f04a",
  "image_filename": "0_p1.jpg",
  "lines": [
    {
      "index": 0,                           // Zero-based line order
      "bbox": [1867.0, 0.0, 1955.0, 99.0], // [x_min, y_min, x_max, y_max]
      "polygon": [[1886.0, 0.0], [1955.0, 0.0], [1935.0, 99.0], [1867.0, 98.0]], // 4 corners of rotated bbox
      "confidence": 0.9200848937034607       // Detection confidence 0–1
    }
    // ...
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `submission_id` | string | Links back to the submission |
| `image_filename` | string | Corresponding page image file |
| `lines[].index` | integer | Zero-based line index in detection order |
| `lines[].bbox` | [number, number, number, number] | Axis-aligned bounding box `[x_min, y_min, x_max, y_max]` in image pixel coordinates |
| `lines[].polygon` | [[number, number], ...] | Four-corner polygon (rotated bounding box) in image pixel coordinates, top-left → top-right → bottom-right → bottom-left |
| `lines[].confidence` | number | Detection confidence score (0.0–1.0) from the Surya layout detector |

The bounding box (`bbox`) is the axis-aligned rectangle that contains the rotated polygon (`polygon`). For most use cases `polygon` is more accurate (it captures rotated or angled lines). Use `bbox` when you only need a fast axis-aligned approximation.

---

## Interpretation Guide

### How the dataset is organized

The dataset is a **completed snapshot** — every submission has been processed and all artifacts written. The two CSVs serve as indexes:

1. **`submissions.csv`** tells you *what* is in the dataset (the full roster).
2. **`pages.csv`** tells you *where* each page's artifacts are.

To iterate the full dataset:

```
for each row in submissions.csv:
    if row.status != "completed": skip or handle error

    metadata = read_json(submission_uuid / "metadata.json")

    for each page row in pages.csv where submission_id == row.submission_id:
        if page.status != "completed": skip or handle error

        image = read(submission_uuid / page.image_filename)
        lines = read_json(submission_uuid / page.lines_filename)
        # ... consume image + lines + metadata ...
```

### Coordinate system

All coordinates (`bbox`, `polygon`) are in **image pixel space** at the native resolution of the rendered JPEG. The images in this dataset are high-resolution (scanned at 300 DPI equivalents). If you need to display lines on a downscaled thumbnail, scale coordinates by `(thumb_width / image_width, thumb_height / image_height)`.

### Partial failure conventions

- If a **submission** failed: `submissions.csv` status = `failed` with an error message. The submission directory may be missing or incomplete. Consumers should skip or flag it.
- If a **page** failed: `pages.csv` status = `failed` with an error message. Other pages for the same submission are unaffected.
- If a page has status = `pending`: line extraction hasn't run yet. The image exists but `lines_filename` may be empty and no lines JSON is written.

### Typical consumption workflows

1. **Dataset analysis / statistics:** Load `submissions.csv`, join with `metadata.json` fields (via `submission_id`), compute aggregations (e.g. distribution of `legibility_score`, `writer_age_range`, native language).

2. **Handwriting recognition (HTR) training:** Iterate `pages.csv`, load each page's image and its lines JSON. Each `bbox`/`polygon` defines a region of interest — you can crop the image at those coordinates to extract individual text-line images for recognition models. The confidence score helps filter out low-quality detections.

3. **Line geometry visualization / QA:** Render the page image, overlay the polygon for each line, color by confidence. This is useful for verifying detection quality before investing in transcription.

4. **Multi-modal dataset construction:** Combine the image, line geometry, and `metadata.json` fields into a single record per page. The `submission_id` and `image_filename` shared between `pages.csv` and the lines JSON serve as the join key.

### Lifecycle

The worker is **idempotent** — re-running against the same source will skip already-completed submissions and only process new or failed ones. The target folder is therefore a cumulative set. A consumer can safely re-ingest the entire folder on each run; the CSVs will grow monotonically (new submissions are appended, existing rows are not modified in place).
