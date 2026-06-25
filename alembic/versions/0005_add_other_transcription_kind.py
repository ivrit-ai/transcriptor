"""add other value to transcriptionkind enum

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres does not allow removing enum values, so downgrade is a no-op.
    # IF NOT EXISTS makes this idempotent (requires PG 9.3+).
    op.execute("ALTER TYPE transcriptionkind ADD VALUE IF NOT EXISTS 'other'")


def downgrade() -> None:
    pass
