import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.line import Line


class TranscriptionKind(str, enum.Enum):
    text = "text"
    cant_read = "cant_read"
    bad_crop = "bad_crop"
    not_hebrew = "not_hebrew"
    not_text = "not_text"
    other = "other"


class Transcription(Base):
    __tablename__ = "transcriptions"
    __table_args__ = (UniqueConstraint("line_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    line_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lines.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    kind: Mapped[TranscriptionKind] = mapped_column(
        SAEnum(TranscriptionKind, name="transcriptionkind"), nullable=False
    )
    text: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    line: Mapped["Line"] = relationship("Line", back_populates="transcriptions")
