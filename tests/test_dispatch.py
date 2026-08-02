import hashlib

from app.config import settings
from tests.conftest import make_batch, make_line, make_page, make_user_progress


def _fingerprint(email: str) -> str:
    return hashlib.sha256(
        (settings.submitter_fingerprint_salt + email.strip().lower()).encode()
    ).hexdigest()


def test_next_session_continues_within_contributed_batch(client, consented_user, db_session, monkeypatch):
    monkeypatch.setattr(settings, "submitter_fingerprint_salt", "test-salt-")

    batch = make_batch(db_session, external_id="contributed")
    batch.submitter_fingerprint = _fingerprint(consented_user.email)

    finished_page = make_page(db_session, batch, external_id="01")
    finished_page.approved = True
    finished_line = make_line(db_session, finished_page)
    finished_line.transcription_count = 3  # already at target — nothing left here

    next_page = make_page(db_session, batch, external_id="02")
    next_page.approved = True
    make_line(db_session, next_page)

    make_user_progress(db_session, consented_user, finished_page, done=True)
    db_session.flush()

    response = client.get("/api/next-session")

    assert response.status_code == 200
    assert response.json()["page_id"] == str(next_page.id)
