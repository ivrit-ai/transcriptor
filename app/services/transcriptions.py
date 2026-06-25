import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.line import Line
from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User
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


def submit_response(
    session: Session,
    user: User,
    line_id: uuid.UUID,
    kind: TranscriptionKind,
    text: str | None,
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

    session.add(Event(
        user_id=user.id,
        line_id=line_id,
        event_type="edited" if is_edit else "submitted",
    ))
    session.flush()

    return SubmitResult(
        transcription_id=transcription_id,
        is_edit=is_edit,
        transcription_count=line.transcription_count,
    )
