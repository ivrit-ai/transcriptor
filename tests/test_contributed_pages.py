import hashlib

from sqlalchemy import select

from app.config import settings
from app.models.event import Event
from tests.conftest import make_batch, make_line, make_page, make_transcription


def _fingerprint(email: str) -> str:
    return hashlib.sha256(
        (settings.submitter_fingerprint_salt + email.strip().lower()).encode()
    ).hexdigest()


def test_contributed_pages_are_scoped_to_current_user(client, consented_user, db_session, monkeypatch):
    monkeypatch.setattr(settings, "submitter_fingerprint_salt", "test-salt-")
    matching_batch = make_batch(db_session, external_id="matching")
    matching_batch.submitter_fingerprint = _fingerprint(consented_user.email)
    approved_page = make_page(db_session, matching_batch, external_id="approved")
    approved_page.approved = True
    pending_page = make_page(db_session, matching_batch, external_id="pending")

    other_batch = make_batch(db_session, external_id="other")
    other_batch.submitter_fingerprint = _fingerprint("someone-else@example.com")
    make_page(db_session, other_batch, external_id="hidden")
    db_session.flush()

    response = client.get("/api/me/contributed-pages")

    assert response.status_code == 200
    assert {item["page_id"] for item in response.json()} == {
        str(approved_page.id),
        str(pending_page.id),
    }
    assert {item["approved"] for item in response.json()} == {True, False}


def test_explicit_session_requires_matching_approved_contribution(client, consented_user, db_session, monkeypatch):
    monkeypatch.setattr(settings, "submitter_fingerprint_salt", "test-salt-")
    matching_batch = make_batch(db_session, external_id="matching")
    matching_batch.submitter_fingerprint = _fingerprint(consented_user.email)
    approved_page = make_page(db_session, matching_batch, external_id="approved")
    approved_page.approved = True
    make_line(db_session, approved_page)

    pending_page = make_page(db_session, matching_batch, external_id="pending")
    other_batch = make_batch(db_session, external_id="other")
    other_batch.submitter_fingerprint = _fingerprint("someone-else@example.com")
    other_page = make_page(db_session, other_batch, external_id="other")
    other_page.approved = True
    db_session.flush()

    assert client.get(f"/api/sessions/{approved_page.id}").status_code == 200
    assert client.get(f"/api/sessions/{pending_page.id}").status_code == 404
    assert client.get(f"/api/sessions/{other_page.id}").status_code == 404


def test_session_accessible_when_user_has_prior_work(client, consented_user, db_session, monkeypatch):
    monkeypatch.setattr(settings, "submitter_fingerprint_salt", "test-salt-")

    other_batch = make_batch(db_session, external_id="other")
    other_batch.submitter_fingerprint = _fingerprint("someone-else@example.com")
    other_page = make_page(db_session, other_batch, external_id="other")
    other_page.approved = True
    line = make_line(db_session, other_page)
    make_transcription(db_session, line, consented_user)
    db_session.flush()

    assert client.get(f"/api/sessions/{other_page.id}").status_code == 200


def test_general_problem_report_creates_problem_event(client, consented_user, db_session):
    response = client.post("/api/report", json={"description": "אשרו בבקשה עמודים שתרמתי!"})

    assert response.status_code == 201
    event = db_session.execute(select(Event)).scalar_one()
    assert event.user_id == consented_user.id
    assert event.event_type == "problem"
    assert event.payload["description"] == "אשרו בבקשה עמודים שתרמתי!"
