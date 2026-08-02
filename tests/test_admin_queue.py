"""Regression test for GET /api/admin/queue's batches_complete count.

Without an existence guard, a batch with zero lines (e.g. imported but not
yet detected/split into lines, or with all its pages/lines removed) is
vacuously "complete" — no line fails the completeness check — even though
it has no real transcriptions and is entirely absent from /admin/coverage.
"""

from app.models.line import Line

from .conftest import make_batch, make_line, make_page


def _promote_admin(session, user):
    user.role = "admin"
    session.flush()


def test_batch_with_no_lines_is_not_complete(client, db_session, consented_user):
    _promote_admin(db_session, consented_user)

    # A fully complete batch, to sanity-check the count includes real work.
    complete_batch = make_batch(db_session, external_id="complete-batch")
    complete_page = make_page(db_session, complete_batch, external_id="complete-page")
    complete_line = make_line(db_session, complete_page, external_id="complete-line")
    complete_line.transcription_count = 3
    db_session.flush()

    # A batch with a page but zero lines (e.g. detection hasn't run yet).
    make_batch(db_session, external_id="lineless-batch")
    lineless_page_batch = make_batch(db_session, external_id="lineless-page-batch")
    make_page(db_session, lineless_page_batch, external_id="lineless-page")
    db_session.flush()

    resp = client.get("/api/admin/queue")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["batches_complete"] == 1

    coverage_resp = client.get("/api/admin/coverage")
    assert coverage_resp.status_code == 200, coverage_resp.text
    coverage_external_ids = {row["external_id"] for row in coverage_resp.json()}
    # Confirms the premise: coverage inner-joins lineless batches away.
    assert "lineless-batch" not in coverage_external_ids
    assert "lineless-page-batch" not in coverage_external_ids
    assert "complete-batch" in coverage_external_ids


def test_batch_becomes_complete_once_its_only_line_is(client, db_session, consented_user):
    _promote_admin(db_session, consented_user)
    batch = make_batch(db_session, external_id="single-line-batch")
    page = make_page(db_session, batch, external_id="single-line-page")
    line = make_line(db_session, page, external_id="single-line")
    db_session.flush()

    resp = client.get("/api/admin/queue")
    assert resp.json()["batches_complete"] == 0

    line.transcription_count = 3
    db_session.flush()

    resp = client.get("/api/admin/queue")
    assert resp.json()["batches_complete"] == 1
