"""Tests for re-importing source data against curated pages.

A re-import must never touch the lines of a page whose curated_at is set
(it would overwrite the curator's bbox/polygon edits, resurrect deleted
lines, and duplicate curator-added lines). Only --clear-existing may wipe
curated pages.
"""

import csv
import json
from datetime import datetime, timezone

from app.models.line import Line
from app.models.page import Page
from scripts.import_source_data import clear_existing_submissions, import_source_data

SUBMISSION_ID = "sub1"
PAGE_EXT = "doc1:p1"


def _build_root(tmp_path, lines_bbox, lines_confidence=0.9):
    """Build a minimal source-data tree for one completed submission/page."""
    root = tmp_path / "source"
    root.mkdir(exist_ok=True)

    with open(root / "submissions.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["submission_id", "status"])
        w.writerow([SUBMISSION_ID, "completed"])

    with open(root / "pages.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            ["submission_id", "doc_filename", "page_number", "image_filename", "lines_filename", "status"]
        )
        w.writerow([SUBMISSION_ID, "doc1", 1, "page1.jpg", "lines.json", "completed"])

    sub_dir = root / SUBMISSION_ID
    sub_dir.mkdir(exist_ok=True)
    (sub_dir / "metadata.json").write_text(json.dumps({"submitter_fingerprint": "fp1"}))
    (sub_dir / "lines.json").write_text(
        json.dumps(
            {
                "image_width": 800,
                "image_height": 1200,
                "lines": [
                    {
                        "index": 0,
                        "bbox": lines_bbox,
                        "confidence": lines_confidence,
                    }
                ],
            }
        )
    )
    return root


def test_reimport_updates_non_curated_page_lines(db_session, tmp_path):
    root = _build_root(tmp_path, [0, 0, 100, 30])
    import_source_data(db_session, root, "src", "cc0", remote_images=True)

    line = db_session.query(Line).one()
    page = db_session.query(Page).one()
    assert page.curated_at is None
    assert line.bbox == {"x": 0, "y": 0, "w": 100, "h": 30}

    root = _build_root(tmp_path, [10, 10, 200, 60])
    import_source_data(db_session, root, "src", "cc0", remote_images=True)

    db_session.flush()
    db_session.expire_all()
    line = db_session.get(Line, line.id)
    assert line.bbox == {"x": 10, "y": 10, "w": 190, "h": 50}


def test_reimport_skips_curated_page_lines(db_session, tmp_path):
    root = _build_root(tmp_path, [0, 0, 100, 30])
    import_source_data(db_session, root, "src", "cc0", remote_images=True)

    page = db_session.query(Page).one()
    line = db_session.query(Line).one()
    page.curated_at = datetime.now(timezone.utc)
    line.bbox = {"x": 5, "y": 5, "w": 90, "h": 40}
    line.detection_confidence = 0.99
    db_session.flush()

    root = _build_root(tmp_path, [10, 10, 200, 60], lines_confidence=0.5)
    import_source_data(db_session, root, "src", "cc0", remote_images=True)

    db_session.flush()
    db_session.expire_all()
    line = db_session.get(Line, line.id)
    assert line.bbox == {"x": 5, "y": 5, "w": 90, "h": 40}
    assert line.detection_confidence == 0.99


def test_clear_existing_wipes_curated_page_then_reimports(db_session, tmp_path):
    root = _build_root(tmp_path, [0, 0, 100, 30])
    import_source_data(db_session, root, "src", "cc0", remote_images=True)

    page = db_session.query(Page).one()
    line = db_session.query(Line).one()
    page.curated_at = datetime.now(timezone.utc)
    line.bbox = {"x": 5, "y": 5, "w": 90, "h": 40}
    db_session.flush()
    curated_line_id = line.id

    clear_existing_submissions(db_session, root)
    import_source_data(db_session, root, "src", "cc0", remote_images=True)

    db_session.flush()
    db_session.expire_all()
    assert db_session.get(Line, curated_line_id) is None
    page = db_session.query(Page).one()
    line = db_session.query(Line).one()
    assert page.curated_at is None
    assert line.bbox == {"x": 0, "y": 0, "w": 100, "h": 30}
