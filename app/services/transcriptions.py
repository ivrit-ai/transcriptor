import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.line import Line
from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User
from app.models.user_progress import UserProgress
from app.services.rules import should_increment_count


@dataclass
class SubmitResult:
    transcription_id: uuid.UUID
    is_edit: bool
    transcription_count: int


def _validate_kind_text(kind: TranscriptionKind, text: str | None) -> None:
    if kind == TranscriptionKind.text:
        if not text or not text.strip():
            raise ValueError("kind=text requires non-empty text")
    elif kind == TranscriptionKind.other:
        pass  # text is optional — annotator may supply a freeform reason
    else:
        if text:
            raise ValueError(f"kind={kind.value} must have no text")


def _upsert_user_progress(
    session: Session,
    user_id: uuid.UUID,
    page_id: uuid.UUID,
    line_id: uuid.UUID,
    target: int = 3,
) -> None:
    now = datetime.now(timezone.utc)
    prog = session.execute(
        select(UserProgress).where(
            UserProgress.user_id == user_id,
            UserProgress.page_id == page_id,
        )
    ).scalar_one_or_none()

    user_transcribed_on_page_subq = (
        select(Transcription.line_id)
        .where(
            Transcription.user_id == user_id,
            Transcription.line_id.in_(
                select(Line.id).where(Line.page_id == page_id)
            ),
        )
        .scalar_subquery()
    )

    remaining = session.execute(
        select(func.count(Line.id))
        .where(
            Line.page_id == page_id,
            Line.transcription_count < target,
            Line.id.not_in(user_transcribed_on_page_subq),
        )
    ).scalar_one()

    if prog is None:
        prog = UserProgress(
            user_id=user_id,
            page_id=page_id,
            last_submitted_line_id=line_id,
            done=(remaining == 0),
            skipped=False,
            created_at=now,
            updated_at=now,
        )
        session.add(prog)
    else:
        prog.last_submitted_line_id = line_id
        prog.done = (remaining == 0)
        prog.updated_at = now

    session.flush()


def submit_response(
    session: Session,
    user: User,
    line_id: uuid.UUID,
    kind: TranscriptionKind,
    text: str | None,
    time_spent_ms: int | None = None,
    user_agent: str | None = None,
) -> SubmitResult:
    _validate_kind_text(kind, text)

    line = session.get(Line, line_id)
    if line is None:
        raise ValueError(f"Line {line_id} not found")

    existing = session.execute(
        select(Transcription).where(
            Transcription.line_id == line_id,
            Transcription.user_id == user.id,
        )
    ).scalar_one_or_none()

    is_edit = existing is not None
    if is_edit:
        existing.kind = kind
        existing.text = text
        existing.updated_at = datetime.now(timezone.utc)
        transcription_id = existing.id
    else:
        t = Transcription(line_id=line_id, user_id=user.id, kind=kind, text=text)
        session.add(t)
        session.flush()
        transcription_id = t.id
        if should_increment_count(True):
            line.transcription_count += 1

    payload: dict = {"kind": kind.value, "is_edit": is_edit}
    if time_spent_ms is not None:
        payload["time_spent_ms"] = time_spent_ms
    if user_agent:
        payload["user_agent"] = user_agent

    session.add(Event(
        user_id=user.id,
        line_id=line_id,
        event_type="edited" if is_edit else kind.value,
        payload=payload,
    ))

    _upsert_user_progress(session, user.id, line.page_id, line_id, target=3)
    session.flush()

    return SubmitResult(
        transcription_id=transcription_id,
        is_edit=is_edit,
        transcription_count=line.transcription_count,
    )
