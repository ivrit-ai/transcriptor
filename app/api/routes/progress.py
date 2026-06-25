from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User
from app.storage import resolve_image_url

router = APIRouter()

_DAILY_GOAL = 150  # placeholder until per-user goals are stored
_DAILY_WINDOW_DAYS = 70  # ≈10 weeks of heatmap history
_DOCUMENTS_LIMIT = 60


@router.get("/me/progress")
def my_progress(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    count = db.execute(
        select(func.count(Transcription.id)).where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
    ).scalar_one()
    return {"text_transcription_count": count}


def _compute_streak(active_days: set[date], today: date) -> int:
    """Consecutive days (ending today, UTC) with ≥1 text transcription.

    A streak of 0 means there is no transcription today. We count back day by
    day starting from `today` and stop at the first gap.
    """
    streak = 0
    cursor = today
    while cursor in active_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/me/profile")
def my_profile(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    now = datetime.now(UTC)
    today = now.date()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    base = select(func.count(Transcription.id)).where(
        Transcription.user_id == user.id,
        Transcription.kind == TranscriptionKind.text,
    )

    total: int = db.execute(base).scalar_one()
    today_count: int = db.execute(base.where(Transcription.created_at >= today_start)).scalar_one()
    week: int = db.execute(base.where(Transcription.created_at >= week_start)).scalar_one()

    pages: int = db.execute(
        select(func.count(func.distinct(Line.page_id)))
        .join(Transcription, Transcription.line_id == Line.id)
        .where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
    ).scalar_one()

    documents: int = db.execute(
        select(func.count(func.distinct(Page.document_name)))
        .select_from(Transcription)
        .join(Line, Transcription.line_id == Line.id)
        .join(Page, Line.page_id == Page.id)
        .where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
    ).scalar_one()

    # Distinct active dates over the heatmap window (UTC), used for both the
    # streak and the daily activity series.
    day_col = func.date(Transcription.created_at)
    window_start_date = today - timedelta(days=_DAILY_WINDOW_DAYS - 1)
    rows = db.execute(
        select(day_col, func.count(Transcription.id))
        .where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
        .group_by(day_col)
    ).all()

    # func.date(...) may return a date or an ISO string depending on the driver.
    def _as_date(value) -> date:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))

    counts_by_day: dict[date, int] = {_as_date(d): int(c) for d, c in rows}

    streak = _compute_streak(set(counts_by_day.keys()), today)

    # Fill every day in the window (including zero days) so the frontend gets a
    # dense, ordered series.
    daily = [
        {
            "date": (d := window_start_date + timedelta(days=i)).isoformat(),
            "count": counts_by_day.get(d, 0),
        }
        for i in range(_DAILY_WINDOW_DAYS)
    ]

    return {
        "name": user.display_name,
        "today": today_count,
        "goal": _DAILY_GOAL,
        "streak": streak,
        "week": week,
        "total": total,
        "pages": pages,
        "documents": documents,
        "joined_at": user.created_at.isoformat(),
        "daily": daily,
    }


@router.get("/me/documents")
def my_documents(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    # Per-page aggregates for pages this user has transcribed text on.
    lines_done_col = func.count(func.distinct(Transcription.line_id)).label("lines_done")
    last_at_col = func.max(Transcription.created_at).label("last_at")

    page_rows = db.execute(
        select(Page, lines_done_col, last_at_col)
        .select_from(Transcription)
        .join(Line, Transcription.line_id == Line.id)
        .join(Page, Line.page_id == Page.id)
        .where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
        .group_by(Page.id)
        .order_by(last_at_col.desc())
        .limit(_DOCUMENTS_LIMIT)
    ).all()

    if not page_rows:
        return []

    pages = [row[0] for row in page_rows]
    page_ids = [p.id for p in pages]

    # Total line count per page.
    total_lines_by_page: dict = {
        pid: int(cnt)
        for pid, cnt in db.execute(
            select(Line.page_id, func.count(Line.id))
            .where(Line.page_id.in_(page_ids))
            .group_by(Line.page_id)
        ).all()
    }

    # Spotlight: bbox of the user's most-recently transcribed line on each page.
    spotlight_by_page: dict = {}
    spotlight_rows = db.execute(
        select(Line.page_id, Line.bbox, Transcription.created_at)
        .join(Transcription, Transcription.line_id == Line.id)
        .where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
            Line.page_id.in_(page_ids),
        )
        .order_by(Transcription.created_at.desc())
    ).all()
    for pid, bbox, _created in spotlight_rows:
        # First row per page wins (rows are newest-first).
        if pid not in spotlight_by_page and bbox is not None:
            spotlight_by_page[pid] = {
                "x": bbox.get("x"),
                "y": bbox.get("y"),
                "w": bbox.get("w"),
                "h": bbox.get("h"),
            }

    result = []
    for page, lines_done, last_at in page_rows:
        result.append(
            {
                "page_id": str(page.id),
                "document_name": page.document_name,
                "image_url": resolve_image_url(page.image_path),
                "width_px": page.width_px,
                "height_px": page.height_px,
                "image_rotation": page.image_rotation,
                "lines_done": int(lines_done),
                "total_lines": total_lines_by_page.get(page.id, 0),
                "last_at": last_at.isoformat() if last_at is not None else None,
                "approved": page.approved,
                "spotlight_bbox": spotlight_by_page.get(page.id),
            }
        )
    return result
