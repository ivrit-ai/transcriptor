"""add approved_by and updated_at columns to pages

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pages",
        sa.Column(
            "approved_by",
            sa.Uuid(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_pages_approved_by_users",
        "pages",
        "users",
        ["approved_by"],
        ["id"],
    )
    op.add_column(
        "pages",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_column("pages", "updated_at")
    op.drop_constraint("fk_pages_approved_by_users", "pages", type_="foreignkey")
    op.drop_column("pages", "approved_by")
