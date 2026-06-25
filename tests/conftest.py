import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

import app.models  # noqa: F401 — registers all models
from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.models.consent import ConsentType
from app.models.line import Line
from app.models.page import Page
from app.models.batch import Batch
from app.models.user import User
from app.api.deps import get_current_user
from app.services.consent import record_consent


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(settings.test_database_url)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db_session(test_engine):
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def test_user(db_session):
    user = User(google_sub="test-sub-1", email="user1@test.com", display_name="User One")
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def consented_user(db_session):
    user = User(google_sub="test-sub-consented", email="consented@test.com", display_name="Consented User")
    db_session.add(user)
    db_session.flush()
    record_consent(db_session, user, ConsentType.contribution_license, settings.consent_version, "ref")
    return user


@pytest.fixture
def client(db_session, consented_user):
    def override_db():
        yield db_session

    def override_user():
        return consented_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client_no_consent(db_session, test_user):
    """Client authenticated but no consent recorded."""
    def override_db():
        yield db_session

    def override_user():
        return test_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client_no_auth(db_session):
    """Client with no auth override — tests real 401 behaviour."""
    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── helpers ──────────────────────────────────────────────────────────────────

def make_batch(session, external_id="batch-1", source="src", license_="cc0"):
    b = Batch(external_id=external_id, source=source, license=license_)
    session.add(b)
    session.flush()
    return b


def make_page(session, batch, external_id="page-1", image_path="p1.jpg", w=800, h=1200,
              document_name=None):
    p = Page(batch_id=batch.id, external_id=external_id, image_path=image_path,
             width_px=w, height_px=h,
             document_name=document_name or external_id.split(":")[0])
    session.add(p)
    session.flush()
    return p


def make_line(session, page, line_index=0, bbox=None, external_id=None):
    bbox = bbox or {"x": 0, "y": line_index * 30, "w": 400, "h": 28}
    ext_id = external_id or f"line-{line_index}"
    line = Line(page_id=page.id, line_index=line_index, bbox=bbox, external_id=ext_id)
    session.add(line)
    session.flush()
    return line
