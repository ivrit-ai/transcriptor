import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.batch import Batch
    from app.models.line import Line
    from app.models.user import User


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (UniqueConstraint("batch_id", "external_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("batches.id"), nullable=False)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    document_name: Mapped[str] = mapped_column(String, nullable=False)
    image_path: Mapped[str] = mapped_column(String, nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, default=None)
    rejected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, default=None)
    image_rotation: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    batch: Mapped["Batch"] = relationship("Batch", back_populates="pages")
    lines: Mapped[list["Line"]] = relationship("Line", back_populates="page")
    approver: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by])
    rejecter: Mapped["User | None"] = relationship("User", foreign_keys=[rejected_by])
