"""add curated_at column to pages

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pages", sa.Column("curated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("pages", "curated_at")
