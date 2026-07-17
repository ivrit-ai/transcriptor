"""add index on submitter_fingerprint

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_batches_submitter_fingerprint",
        "batches",
        ["submitter_fingerprint"],
    )


def downgrade() -> None:
    op.drop_index("ix_batches_submitter_fingerprint", table_name="batches")
