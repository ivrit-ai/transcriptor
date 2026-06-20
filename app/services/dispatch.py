import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription
from app.models.user import User
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


def get_next_session(
    session: Session,
    user: User,
    target: int = 3,
) -> SessionDTO | None:
    user_transcribed_subq = (
        select(Transcription.line_id)
        .where(Transcription.user_id == user.id)
        .scalar_subquery()
    )

    eligible_count_subq = (
        select(func.count(Line.id))
        .where(
            Line.page_id == Page.id,
            Line.transcription_count < target,
            Line.id.not_in(user_transcribed_subq),
        )
        .scalar_subquery()
    )

    has_eligible = (
        select(Line)
        .where(
            Line.page_id == Page.id,
            Line.transcription_count < target,
            Line.id.not_in(user_transcribed_subq),
        )
        .exists()
    )

    page = session.execute(
        select(Page)
        .where(Page.approved.is_(True), has_eligible)
        .order_by(eligible_count_subq.desc())
        .limit(1)
    ).scalar_one_or_none()

    if page is None:
        return None

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
