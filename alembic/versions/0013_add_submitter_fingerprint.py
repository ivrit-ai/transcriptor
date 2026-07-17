"""add submitter_fingerprint to batches

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "batches",
        sa.Column("submitter_fingerprint", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("batches", "submitter_fingerprint")
