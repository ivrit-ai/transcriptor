"""add user_progress table and backfill from transcriptions

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-26 00:00:00.000000

"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("page_id", sa.Uuid(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("skipped", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_submitted_line_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_progress_user_id"),
        sa.ForeignKeyConstraint(["page_id"], ["pages.id"], name="fk_user_progress_page_id"),
        sa.ForeignKeyConstraint(
            ["last_submitted_line_id"], ["lines.id"], name="fk_user_progress_last_submitted_line_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "page_id", name="uq_user_progress_user_page"),
    )
    op.create_index(
        "ix_user_progress_user_done_skipped",
        "user_progress",
        ["user_id", "done", "skipped"],
    )

    _backfill_from_transcriptions()


def downgrade() -> None:
    op.drop_index("ix_user_progress_user_done_skipped", table_name="user_progress")
    op.drop_constraint("uq_user_progress_user_page", "user_progress", type_="unique")
    op.drop_table("user_progress")


def _backfill_from_transcriptions() -> None:
    conn = op.get_bind()

    rows = conn.execute(
        sa.text("""
            SELECT t.user_id, t.line_id, l.page_id, t.created_at
            FROM transcriptions t
            JOIN lines l ON l.id = t.line_id
            ORDER BY t.user_id, l.page_id
        """
    )).fetchall()

    if not rows:
        return

    total_lines_on_page = dict(
        conn.execute(
            sa.text("SELECT page_id, COUNT(*) FROM lines GROUP BY page_id")
        ).fetchall()
    )

    groups = defaultdict(lambda: {"line_ids": set(), "last_line_id": None, "last_ts": None})

    for user_id, line_id, page_id, created_at in rows:
        key = (user_id, page_id)
        g = groups[key]
        g["line_ids"].add(line_id)
        if g["last_ts"] is None or created_at > g["last_ts"]:
            g["last_line_id"] = line_id
            g["last_ts"] = created_at

    now = datetime.now(timezone.utc)
    insert_rows = []
    for (user_id, page_id), g in groups.items():
        total = total_lines_on_page.get(page_id, 0)
        insert_rows.append({
            "id": uuid.uuid4(),
            "user_id": user_id,
            "page_id": page_id,
            "done": len(g["line_ids"]) >= total,
            "skipped": False,
            "last_submitted_line_id": g["last_line_id"],
            "created_at": now,
            "updated_at": now,
        })

    op.execute(
        sa.insert(sa.table(
            "user_progress",
            sa.column("id", sa.Uuid),
            sa.column("user_id", sa.Uuid),
            sa.column("page_id", sa.Uuid),
            sa.column("done", sa.Boolean),
            sa.column("skipped", sa.Boolean),
            sa.column("last_submitted_line_id", sa.Uuid),
            sa.column("created_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        )).values(insert_rows)
    )
