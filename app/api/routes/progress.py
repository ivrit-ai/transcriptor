import bisect
import hashlib
import time
from datetime import UTC, date, datetime, timedelta
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.models.batch import Batch
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User
from app.models.user_progress import UserProgress
from app.storage import resolve_image_url

router = APIRouter()

_DAILY_GOAL = 30  # placeholder until per-user goals are stored
_DAILY_WINDOW_DAYS = 70  # ≈10 weeks of heatmap history
_DOCUMENTS_LIMIT = 60

# ── Rank cache ────────────────────────────────────────────────────────────────
# Stores per-user transcription counts for all leaderboard-visible users.
# Shared across all requests; refreshed at most once per TTL window.

_rank_cache_lock = Lock()
_rank_cache_counts: list[int] = []        # sorted ascending
_rank_cache_by_uid: dict[str, int] = {}   # user_id (str) -> count
_rank_cache_at: float = 0.0
_RANK_CACHE_TTL = 120.0  # seconds


def _get_rank_cache(db: Session) -> tuple[list[int], dict[str, int]]:
    global _rank_cache_counts, _rank_cache_by_uid, _rank_cache_at
    now = time.monotonic()
    with _rank_cache_lock:
        if now - _rank_cache_at < _RANK_CACHE_TTL:
            return _rank_cache_counts, _rank_cache_by_uid
    # DB query outside the lock so other threads are not blocked during I/O.
    # On exception, update _rank_cache_at so callers back off for a full TTL
    # rather than hammering a down DB on every request.
    try:
        rows = db.execute(
            select(User.id, func.count(Transcription.id).label("cnt"))
            .join(Transcription, Transcription.user_id == User.id)
            .where(
                Transcription.kind == TranscriptionKind.text,
                User.show_on_leaderboard == True,
            )
            .group_by(User.id)
        ).all()
    except Exception:
        with _rank_cache_lock:
            _rank_cache_at = now
        raise
    by_uid: dict[str, int] = {str(uid): int(cnt) for uid, cnt in rows}
    counts = sorted(by_uid.values())
    with _rank_cache_lock:
        _rank_cache_counts = counts
        _rank_cache_by_uid = by_uid
        _rank_cache_at = now
        return counts, by_uid


@router.get("/me/rank")
def my_rank(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    # Cheap: single indexed COUNT for the current user's live count.
    user_count = db.execute(
        select(func.count(Transcription.id)).where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
    ).scalar_one()

    counts, by_uid = _get_rank_cache(db)

    # Build a view of the cache that excludes the current user so their own
    # score doesn't affect their rank among others.
    uid_str = str(user.id)
    other_counts = counts
    if uid_str in by_uid:
        idx = bisect.bisect_left(counts, by_uid[uid_str])
        other_counts = counts[:idx] + counts[idx + 1:]

    # Pure-Python rank computation — no more SQL after the cache hit.
    above = [c for c in other_counts if c > user_count]
    users_above = len(above)

    if above:
        next_threshold = min(above)
        lines_to_next = next_threshold - user_count
        target_rank = sum(1 for c in other_counts if c > next_threshold) + 1
    else:
        lines_to_next = None
        target_rank = None

    return {
        "rank": users_above + 1,
        "count": user_count,
        "lines_to_next": lines_to_next,
        "target_rank": target_rank,
        "show_on_leaderboard": bool(user.show_on_leaderboard),
    }


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
    # Collect page IDs from both UserProgress (done/skipped) and Transcriptions
    # (actively worked-on). This ensures skipped pages are not missed.
    from_progress = select(UserProgress.page_id).where(
        UserProgress.user_id == user.id,
    )
    from_transcriptions = (
        select(Page.id)
        .select_from(Transcription)
        .join(Line, Transcription.line_id == Line.id)
        .join(Page, Line.page_id == Page.id)
        .where(
            Transcription.user_id == user.id,
            Transcription.kind == TranscriptionKind.text,
        )
    )
    all_page_ids = list(
        db.execute(from_progress.union(from_transcriptions)).scalars().all()
    )
    if not all_page_ids:
        return []

    # UserProgress lookup per page.
    progress_rows = (
        db.execute(
            select(UserProgress).where(
                UserProgress.user_id == user.id,
                UserProgress.page_id.in_(all_page_ids),
            )
        )
        .scalars()
        .all()
    )
    progress_by_page = {p.page_id: p for p in progress_rows}

    # Per-page aggregates (Page + transcription stats).  LEFT JOIN so that
    # pages with zero transcriptions (e.g. skipped) still appear.
    page_rows = db.execute(
        select(
            Page,
            func.count(func.distinct(Transcription.line_id)).label("lines_done"),
            func.max(Transcription.created_at).label("last_at"),
        )
        .select_from(Page)
        .outerjoin(Line, Line.page_id == Page.id)
        .outerjoin(
            Transcription,
            (Transcription.line_id == Line.id)
            & (Transcription.user_id == user.id)
            & (Transcription.kind == TranscriptionKind.text),
        )
        .where(Page.id.in_(all_page_ids))
        .group_by(Page.id)
        .order_by(func.max(Transcription.created_at).desc().nulls_last())
        .limit(_DOCUMENTS_LIMIT)
    ).all()

    pages = [row[0] for row in page_rows]
    page_ids = [p.id for p in pages]

    # Spotlight: most-recently transcribed bbox per page (Postgres DISTINCT ON
    # via row_number window).
    spotlight_by_page: dict = {}
    if page_ids:
        ranked = (
            select(
                Line.page_id,
                Line.bbox,
                func.row_number()
                .over(
                    partition_by=Line.page_id,
                    order_by=Transcription.created_at.desc(),
                )
                .label("rn"),
            )
            .join(Transcription, Transcription.line_id == Line.id)
            .where(
                Transcription.user_id == user.id,
                Transcription.kind == TranscriptionKind.text,
                Line.page_id.in_(page_ids),
            )
            .subquery()
        )
        spotlight_rows = db.execute(
            select(ranked.c.page_id, ranked.c.bbox).where(ranked.c.rn == 1)
        ).all()
        for pid, bbox in spotlight_rows:
            if bbox is not None:
                spotlight_by_page[pid] = {
                    "x": bbox.get("x"),
                    "y": bbox.get("y"),
                    "w": bbox.get("w"),
                    "h": bbox.get("h"),
                }

    result = []
    for page, lines_done, last_at in page_rows:
        prog = progress_by_page.get(page.id)
        if prog is not None:
            status = "done" if prog.done else ("skipped" if prog.skipped else "active")
        else:
            # Pages touched before user_progress existed are shown as active.
            status = "active"

        result.append(
            {
                "page_id": str(page.id),
                "document_name": page.document_name,
                "page_label": page.external_id,
                "image_url": resolve_image_url(page.image_path),
                "width_px": page.width_px,
                "height_px": page.height_px,
                "image_rotation": page.image_rotation,
                "lines_done": int(lines_done) if lines_done else 0,
                "last_at": last_at.isoformat() if last_at is not None else None,
                "approved": page.approved,
                "spotlight_bbox": spotlight_by_page.get(page.id),
                "status": status,
                "done": prog.done if prog is not None else False,
                "skipped": prog.skipped if prog is not None else False,
            }
        )
    return result


@router.get("/me/contributed-pages")
def my_contributed_pages(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    normalized_email = user.email.strip().lower()
    fingerprint = hashlib.sha256(
        (settings.submitter_fingerprint_salt + normalized_email).encode()
    ).hexdigest()

    pages = db.execute(
        select(Page)
        .join(Batch, Batch.id == Page.batch_id)
        .where(Batch.submitter_fingerprint == fingerprint)
        .order_by(Batch.external_id, Page.external_id)
    ).scalars().all()

    return [
        {
            "page_id": str(page.id),
            "document_name": page.document_name,
            "page_label": page.external_id,
            "image_url": resolve_image_url(page.image_path),
            "width_px": page.width_px,
            "height_px": page.height_px,
            "image_rotation": page.image_rotation,
            "approved": page.approved,
        }
        for page in pages
    ]
