import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.page import Page
    from app.models.transcription import Transcription
    from app.models.event import Event


class Line(Base):
    __tablename__ = "lines"
    __table_args__ = (
        UniqueConstraint("page_id", "external_id"),
        Index("ix_lines_page_id", "page_id"),
        Index("ix_lines_page_id_tc", "page_id", "transcription_count"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id"), nullable=False)
    line_index: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox: Mapped[dict] = mapped_column(JSONB, nullable=False)
    polygon: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    detection_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    transcription_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    external_id: Mapped[str] = mapped_column(String, nullable=False)

    page: Mapped["Page"] = relationship("Page", back_populates="lines")
    transcriptions: Mapped[list["Transcription"]] = relationship("Transcription", back_populates="line", passive_deletes=True)
    events: Mapped[list["Event"]] = relationship("Event", back_populates="line", passive_deletes=True)
