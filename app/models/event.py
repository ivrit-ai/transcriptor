import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.line import Line

class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    line_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lines.id", ondelete="CASCADE"), nullable=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    line: Mapped["Line | None"] = relationship("Line", back_populates="events", foreign_keys=[line_id])
