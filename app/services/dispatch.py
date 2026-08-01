import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.batch import Batch
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription
from app.models.user import User
from app.models.user_progress import UserProgress
from app.services.rules import SessionLine, order_session_lines
from app.storage import resolve_image_url


@dataclass
class SessionLineDTO:
    id: uuid.UUID
    line_index: int
    bbox: dict
    polygon: dict | None
    status: str
    prior_kind: str | None
    prior_text: str | None


@dataclass
class SessionDTO:
    page_id: uuid.UUID
    image_url: str
    width_px: int
    height_px: int
    image_rotation: int
    page_label: str | None
    lines: list[SessionLineDTO]
    # Higher-resolution "raw" source image, when available (same aspect ratio
    # and rotation as image_url; line bbox/polygon coordinates are always in
    # image_url's pixel space, NOT the raw image's). None when the page has
    # no raw image on record — clients must fall back to image_url.
    raw_image_url: str | None = None


def get_next_session(
    session: Session,
    user: User,
    target: int = 3,
) -> SessionDTO | None:
    has_progress = session.execute(
        select(UserProgress)
        .where(UserProgress.user_id == user.id)
        .limit(1)
        .exists()
        .select()
    ).scalar_one()

    if not has_progress:
        return _case_a_random(session, user, target)

    return _case_b_with_progress(session, user, target)


def _page_has_eligible_line(
    session: Session,
    page_id: uuid.UUID,
    user_id: uuid.UUID,
    user_transcribed_subq,
    target: int = 3,
) -> bool:
    return session.execute(
        select(Line)
        .where(
            Line.page_id == page_id,
            Line.transcription_count < target,
            Line.id.not_in(user_transcribed_subq),
        )
        .exists()
        .select()
    ).scalar_one()


def _case_a_random(
    session: Session,
    user: User,
    target: int = 3,
) -> SessionDTO | None:
    line = session.execute(
        select(Line)
        .join(Page, Line.page_id == Page.id)
        .where(
            Page.approved.is_(True),
            Line.transcription_count < target,
        )
        .order_by(func.random())
        .limit(1)
    ).scalar_one_or_none()

    if line is None:
        return None

    return _build_session_dto(session, user, line.page, target)


def _case_b_with_progress(
    session: Session,
    user: User,
    target: int = 3,
) -> SessionDTO | None:
    user_transcribed_subq = (
        select(Transcription.line_id)
        .where(Transcription.user_id == user.id)
        .scalar_subquery()
    )

    last_progress = session.execute(
        select(UserProgress)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.skipped.is_(False),
        )
        .order_by(UserProgress.updated_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    if last_progress is not None:
        page = session.get(Page, last_progress.page_id)
        if page is not None and page.approved and _page_has_eligible_line(
            session, page.id, user.id, user_transcribed_subq, target
        ):
            return _build_session_dto(session, user, page, target)

        # Continue within a contributed manuscript before falling back to unrelated pages.
        if page is not None:
            next_contributed = _next_contributed_page(
                session, user, page, user_transcribed_subq, target
            )
            if next_contributed is not None:
                return _build_session_dto(session, user, next_contributed, target)

    unfinished = session.execute(
        select(UserProgress)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.done.is_(False),
            UserProgress.skipped.is_(False),
        )
        .limit(1)
    ).scalar_one_or_none()

    if unfinished is not None:
        page = session.get(Page, unfinished.page_id)
        if page is not None and page.approved and _page_has_eligible_line(
            session, page.id, user.id, user_transcribed_subq, target
        ):
            return _build_session_dto(session, user, page, target)

    return _case_a_random_with_exclusions(session, user, target)


def _next_contributed_page(
    session: Session,
    user: User,
    finished_page: Page,
    user_transcribed_subq,
    target: int,
) -> Page | None:
    # Next unfinished page in finished_page's batch, only if user contributed it.
    batch = session.get(Batch, finished_page.batch_id)
    if batch is None or not batch.submitter_fingerprint:
        return None

    fingerprint = hashlib.sha256(
        (settings.submitter_fingerprint_salt + user.email.strip().lower()).encode()
    ).hexdigest()
    if batch.submitter_fingerprint != fingerprint:
        return None

    excluded_page_ids_subq = (
        select(UserProgress.page_id)
        .where(
            UserProgress.user_id == user.id,
            or_(UserProgress.done.is_(True), UserProgress.skipped.is_(True)),
        )
        .scalar_subquery()
    )

    candidates = session.execute(
        select(Page)
        .where(
            Page.batch_id == batch.id,
            Page.approved.is_(True),
            Page.id != finished_page.id,
            Page.id.not_in(excluded_page_ids_subq),
        )
        .order_by(Page.external_id)
    ).scalars().all()

    for page in candidates:
        if _page_has_eligible_line(session, page.id, user.id, user_transcribed_subq, target):
            return page
    return None


def _case_a_random_with_exclusions(
    session: Session,
    user: User,
    target: int = 3,
) -> SessionDTO | None:
    excluded_page_ids_subq = (
        select(UserProgress.page_id)
        .where(UserProgress.user_id == user.id)
        .scalar_subquery()
    )

    line = session.execute(
        select(Line)
        .join(Page, Line.page_id == Page.id)
        .where(
            Page.approved.is_(True),
            Line.transcription_count < target,
            Page.id.not_in(excluded_page_ids_subq),
        )
        .order_by(func.random())
        .limit(1)
    ).scalar_one_or_none()

    if line is None:
        return None

    return _build_session_dto(session, user, line.page, target)


def mark_page_skipped(
    db: Session,
    user: User,
    page_id: uuid.UUID,
) -> None:
    now = datetime.now(timezone.utc)
    prog = db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.page_id == page_id,
        )
    ).scalar_one_or_none()

    if prog is None:
        prog = UserProgress(
            user_id=user.id,
            page_id=page_id,
            skipped=True,
            created_at=now,
            updated_at=now,
        )
        db.add(prog)
    else:
        prog.skipped = True
        prog.updated_at = now

    db.flush()


def get_session_for_page(
    session: Session,
    user: User,
    page_id: uuid.UUID,
    target: int = 3,
) -> SessionDTO | None:
    page = session.get(Page, page_id)
    if page is None or not page.approved:
        return None

    return _build_session_dto(session, user, page, target)


def _build_session_dto(
    session: Session,
    user: User,
    page: Page,
    target: int = 3,
) -> SessionDTO:
    lines = session.execute(
        select(Line)
        .where(Line.page_id == page.id)
        .order_by(Line.line_index)
    ).scalars().all()

    user_transcriptions = {
        t.line_id: {"kind": t.kind.value, "text": t.text}
        for t in session.execute(
            select(Transcription).where(
                Transcription.line_id.in_([l.id for l in lines]),
                Transcription.user_id == user.id,
            )
        ).scalars().all()
    }

    session_lines = [
        SessionLine(
            id=line.id,
            line_index=line.line_index,
            bbox=line.bbox,
            polygon=line.polygon,
            transcription_count=line.transcription_count,
            user_transcription=user_transcriptions.get(line.id),
        )
        for line in lines
    ]

    ordered = order_session_lines(session_lines, target=target)

    return SessionDTO(
        page_id=page.id,
        image_url=resolve_image_url(page.image_path),
        width_px=page.width_px,
        height_px=page.height_px,
        image_rotation=page.image_rotation,
        page_label=page.external_id,
        raw_image_url=resolve_image_url(page.raw_image_path) if page.raw_image_path else None,
        lines=[
            SessionLineDTO(
                id=item["id"],
                line_index=item["line_index"],
                bbox=item["bbox"],
                polygon=item["polygon"],
                status=item["status"],
                prior_kind=item["prior_kind"],
                prior_text=item["prior_text"],
            )
            for item in ordered
        ],
    )
