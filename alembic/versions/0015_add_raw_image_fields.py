"""add raw_image_path, raw_width_px, raw_height_px columns to pages

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pages", sa.Column("raw_image_path", sa.String(), nullable=True))
    op.add_column("pages", sa.Column("raw_width_px", sa.Integer(), nullable=True))
    op.add_column("pages", sa.Column("raw_height_px", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("pages", "raw_height_px")
    op.drop_column("pages", "raw_width_px")
    op.drop_column("pages", "raw_image_path")
