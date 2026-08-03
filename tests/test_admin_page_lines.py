"""Regression tests for PUT /api/admin/page_lines.

Guards against the critical bug where saving any line edit — including a
pure rotation change — bulk-deleted every Line row for the page and
recreated them with fresh UUIDs, cascading away all Transcription/
UserProgress rows and trusting the client's stale transcription_count.
"""

from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription

from .conftest import make_batch, make_line, make_page, make_transcription


def _promote_curator(session, user):
    user.role = "curator"
    session.flush()


def test_pure_rotation_change_preserves_transcriptions(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    batch = make_batch(db_session)
    page = make_page(db_session, batch, w=800, h=1200)
    line = make_line(db_session, page, line_index=0, bbox={"x": 10, "y": 20, "w": 100, "h": 30}, external_id="ln-1")
    line.transcription_count = 2
    db_session.flush()
    make_transcription(db_session, line, consented_user, text="original text")
    original_line_id = line.id

    # Client rotates 90deg and echoes the client-side rotated bbox, per
    # frontend/src/utils/bbox.ts rotateBbox — plus a stale transcription_count.
    rotated_bbox = {"x": 1200 - 20 - 30, "y": 10, "w": 30, "h": 100}
    resp = client.put(
        f"/api/admin/page_lines?page_id={page.id}",
        json={
            "rotation": 90,
            "lines": [
                {
                    "external_id": "ln-1",
                    "bbox": rotated_bbox,
                    "transcription_count": 0,  # stale/wrong — must be ignored
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["image_rotation"] == 90
    assert body["line_ids"] == [str(original_line_id)]

    db_session.expire_all()
    refreshed = db_session.get(Line, original_line_id)
    assert refreshed is not None
    assert refreshed.bbox == rotated_bbox
    assert refreshed.transcription_count == 2  # preserved, not reset to client's 0

    transcriptions = (
        db_session.query(Transcription).filter(Transcription.line_id == original_line_id).all()
    )
    assert len(transcriptions) == 1
    assert transcriptions[0].text == "original text"


def test_actual_bbox_edit_invalidates_only_that_line(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    batch = make_batch(db_session)
    page = make_page(db_session, batch, w=800, h=1200)
    moved_line = make_line(db_session, page, line_index=0, bbox={"x": 0, "y": 0, "w": 100, "h": 30}, external_id="ln-a")
    moved_line.transcription_count = 1
    untouched_line = make_line(
        db_session, page, line_index=1, bbox={"x": 0, "y": 40, "w": 100, "h": 30}, external_id="ln-b"
    )
    untouched_line.transcription_count = 1
    db_session.flush()
    make_transcription(db_session, moved_line, consented_user, text="will be invalidated")
    make_transcription(db_session, untouched_line, consented_user, text="stays intact")
    moved_id, untouched_id = moved_line.id, untouched_line.id

    resp = client.put(
        f"/api/admin/page_lines?page_id={page.id}",
        json={
            "lines": [
                # ln-a's bbox actually moved — no rotation involved.
                {"external_id": "ln-a", "bbox": {"x": 5, "y": 5, "w": 100, "h": 30}},
                # ln-b resent unchanged.
                {"external_id": "ln-b", "bbox": {"x": 0, "y": 40, "w": 100, "h": 30}},
            ],
        },
    )
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    moved = db_session.get(Line, moved_id)
    untouched = db_session.get(Line, untouched_id)

    assert moved.transcription_count == 0
    assert db_session.query(Transcription).filter(Transcription.line_id == moved_id).count() == 0

    assert untouched.transcription_count == 1
    remaining = db_session.query(Transcription).filter(Transcription.line_id == untouched_id).all()
    assert len(remaining) == 1
    assert remaining[0].text == "stays intact"


def test_curation_sets_curated_at(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    batch = make_batch(db_session)
    page = make_page(db_session, batch, w=800, h=1200)
    make_line(db_session, page, line_index=0, bbox={"x": 0, "y": 0, "w": 100, "h": 30}, external_id="ln-1")
    assert page.curated_at is None
    db_session.flush()

    resp = client.put(
        f"/api/admin/page_lines?page_id={page.id}",
        json={
            "lines": [
                {"external_id": "ln-1", "bbox": {"x": 5, "y": 5, "w": 100, "h": 30}},
            ],
        },
    )
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    page = db_session.get(Page, page.id)
    assert page.curated_at is not None


def test_removed_line_cascades_and_new_line_ignores_client_count(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    batch = make_batch(db_session)
    page = make_page(db_session, batch, w=800, h=1200)
    kept = make_line(db_session, page, line_index=0, bbox={"x": 0, "y": 0, "w": 100, "h": 30}, external_id="ln-keep")
    removed = make_line(
        db_session, page, line_index=1, bbox={"x": 0, "y": 40, "w": 100, "h": 30}, external_id="ln-remove"
    )
    make_transcription(db_session, removed, consented_user, text="gone with the line")
    removed_id = removed.id

    resp = client.put(
        f"/api/admin/page_lines?page_id={page.id}",
        json={
            "lines": [
                {"external_id": "ln-keep", "bbox": {"x": 0, "y": 0, "w": 100, "h": 30}},
                {
                    "external_id": "ln-new",
                    "bbox": {"x": 0, "y": 80, "w": 100, "h": 30},
                    "transcription_count": 999,  # must be ignored for genuinely new lines
                },
            ],
        },
    )
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    assert db_session.get(Line, removed_id) is None
    assert db_session.query(Transcription).filter(Transcription.line_id == removed_id).count() == 0

    remaining_lines = db_session.query(Line).filter(Line.page_id == page.id).all()
    by_external_id = {l.external_id: l for l in remaining_lines}
    assert set(by_external_id) == {"ln-keep", "ln-new"}
    assert by_external_id["ln-new"].transcription_count == 0
    assert by_external_id["ln-keep"].id == kept.id
