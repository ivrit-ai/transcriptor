"""Tests for the transcriptions filter on GET /api/admin/pages."""

from .conftest import make_batch, make_line, make_page


def _promote_curator(session, user):
    user.role = "curator"
    session.flush()


def test_transcriptions_filter_selects_pages_by_coverage(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    batch = make_batch(db_session)

    transcribed_page = make_page(db_session, batch, external_id="page-transcribed", image_path="t.jpg")
    transcribed_line = make_line(db_session, transcribed_page, line_index=0, external_id="ln-t")
    transcribed_line.transcription_count = 2
    make_line(db_session, transcribed_page, line_index=1, external_id="ln-t2")

    untouched_page = make_page(db_session, batch, external_id="page-untouched", image_path="u.jpg")
    make_line(db_session, untouched_page, line_index=0, external_id="ln-u")
    db_session.flush()

    resp = client.get("/api/admin/pages?page_size=100&transcriptions=transcribed")
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert [i["page_external_id"] for i in items] == ["page-transcribed"]

    resp = client.get("/api/admin/pages?page_size=100&transcriptions=not-transcribed")
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert [i["page_external_id"] for i in items] == ["page-untouched"]


def test_transcriptions_filter_composes_with_status(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    batch = make_batch(db_session)
    page = make_page(db_session, batch, external_id="p1", image_path="p1.jpg")
    line = make_line(db_session, page, line_index=0, external_id="ln-1")
    line.transcription_count = 1
    db_session.flush()

    resp = client.get("/api/admin/pages?transcriptions=not-transcribed&status=unreviewed")
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0


def test_transcriptions_filter_rejects_invalid_value(client, db_session, consented_user):
    _promote_curator(db_session, consented_user)
    resp = client.get("/api/admin/pages?transcriptions=bogus")
    assert resp.status_code == 422
