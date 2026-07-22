"""Profile page endpoints — streak logic, documents count, /me/documents."""
from datetime import UTC, datetime, timedelta

from app.models.transcription import Transcription, TranscriptionKind
from tests.conftest import make_batch, make_line, make_page


def _text_tx(db, user, line, when):
    tx = Transcription(
        line_id=line.id,
        user_id=user.id,
        kind=TranscriptionKind.text,
        text="x",
        created_at=when,
        updated_at=when,
    )
    db.add(tx)
    db.flush()
    return tx


def test_streak_counts_consecutive_days_ending_today(client, db_session, consented_user):
    batch = make_batch(db_session, "b-streak")
    page = make_page(db_session, batch, "doc-streak")
    now = datetime.now(UTC)
    # text on today, yesterday, day-before → streak 3, then a gap.
    for offset in (0, 1, 2, 4):
        line = make_line(db_session, page, line_index=offset, external_id=f"l-streak-{offset}")
        _text_tx(db_session, consented_user, line, now - timedelta(days=offset))

    body = client.get("/api/me/profile").json()
    assert body["streak"] == 3


def test_streak_zero_when_no_activity_today(client, db_session, consented_user):
    batch = make_batch(db_session, "b-streak0")
    page = make_page(db_session, batch, "doc-streak0")
    now = datetime.now(UTC)
    line = make_line(db_session, page, line_index=0, external_id="l-streak0-0")
    _text_tx(db_session, consented_user, line, now - timedelta(days=1))

    body = client.get("/api/me/profile").json()
    assert body["streak"] == 0


def test_profile_documents_count_distinct_document_names(client, db_session, consented_user):
    batch = make_batch(db_session, "b-docs")
    p1 = make_page(db_session, batch, "p-docs-a", document_name="alpha")
    p2 = make_page(db_session, batch, "p-docs-b", document_name="alpha")  # same document
    p3 = make_page(db_session, batch, "p-docs-c", document_name="beta")
    now = datetime.now(UTC)
    for i, page in enumerate((p1, p2, p3)):
        line = make_line(db_session, page, line_index=0, external_id=f"l-docs-{i}")
        _text_tx(db_session, consented_user, line, now)

    body = client.get("/api/me/profile").json()
    assert body["documents"] == 2  # alpha + beta
    assert body["pages"] == 3
    assert "joined_at" in body
    assert len(body["daily"]) == 70


def test_my_documents_shape_and_order(client, db_session, consented_user):
    batch = make_batch(db_session, "b-mydocs")
    older = make_page(db_session, batch, "p-old", document_name="old-doc")
    newer = make_page(db_session, batch, "p-new", document_name="new-doc")
    now = datetime.now(UTC)

    lo = make_line(db_session, older, line_index=0, bbox={"x": 1, "y": 2, "w": 3, "h": 4},
                   external_id="l-old-0")
    _text_tx(db_session, consented_user, lo, now - timedelta(days=2))

    ln = make_line(db_session, newer, line_index=0, bbox={"x": 5, "y": 6, "w": 7, "h": 8},
                   external_id="l-new-0")
    make_line(db_session, newer, line_index=1, external_id="l-new-1")  # untranscribed
    _text_tx(db_session, consented_user, ln, now)

    body = client.get("/api/me/documents").json()
    assert [d["document_name"] for d in body] == ["new-doc", "old-doc"]
    new_doc = body[0]
    assert new_doc["page_label"] == "p-new"
    assert new_doc["lines_done"] == 1
    assert new_doc["spotlight_bbox"] == {"x": 5, "y": 6, "w": 7, "h": 8}
    assert new_doc["image_url"].endswith(".jpg") or new_doc["image_url"].startswith("/images/")
    assert new_doc["approved"] is False
