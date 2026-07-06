import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User

_cache: dict = {"data": None, "expires_at": 0.0}
_cache_week: dict = {"data": None, "expires_at": 0.0}
_streak_cache: dict = {"data": None, "expires_at": 0.0}
CACHE_TTL = 60.0


def _anonymize(display_name: str) -> str:
    """Keep only the first letter of each name part; mask the rest with *."""
    if not display_name:
        return display_name
    parts = display_name.split()
    masked = []
    for part in parts:
        if len(part) <= 1:
            masked.append(part)
        else:
            masked.append(part[0] + "*" * (len(part) - 1))
    return " ".join(masked)


def get_leaderboard(session: Session, ttl: float = CACHE_TTL, since: datetime | None = None) -> list[dict]:
    cache = _cache_week if since is not None else _cache
    now = time.time()
    if ttl > 0 and cache["data"] is not None and now < cache["expires_at"]:
        return cache["data"]
    data = _query_leaderboard(session, since=since)
    if ttl > 0:
        cache.update({"data": data, "expires_at": now + ttl})
    return data


def _query_leaderboard(session: Session, since: datetime | None = None) -> list[dict]:
    stmt = (
        select(User.id, User.display_name, func.count(Transcription.id).label("count"))
        .join(Transcription, Transcription.user_id == User.id)
        .where(
            Transcription.kind == TranscriptionKind.text,
            User.show_on_leaderboard == True,
        )
        .group_by(User.id, User.display_name)
        .order_by(func.count(Transcription.id).desc())
        .limit(100)
    )
    if since is not None:
        stmt = stmt.where(Transcription.created_at >= since)
    rows = session.execute(stmt).all()
    return [{"display_name": _anonymize(r.display_name), "count": r.count} for r in rows]


def _compute_streak(active_days: set[date], today: date) -> int:
    # For the hall of fame, a streak is still alive if the user was active
    # yesterday but hasn't transcribed yet today (it's only broken once they
    # miss a full calendar day).
    start = today if today in active_days else today - timedelta(days=1)
    streak = 0
    cursor = start
    while cursor in active_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def get_streak_leaders(session: Session, limit: int = 10, ttl: float = CACHE_TTL) -> list[dict]:
    now = time.time()
    if ttl > 0 and _streak_cache["data"] is not None and now < _streak_cache["expires_at"]:
        return _streak_cache["data"]
    data = _query_streak_leaders(session, limit)
    if ttl > 0:
        _streak_cache.update({"data": data, "expires_at": now + ttl})
    return data


def _query_streak_leaders(session: Session, limit: int) -> list[dict]:
    day_col = func.date(Transcription.created_at).label("day")
    rows = session.execute(
        select(User.display_name, Transcription.user_id, day_col)
        .join(User, User.id == Transcription.user_id)
        .where(
            Transcription.kind == TranscriptionKind.text,
            User.show_on_leaderboard == True,
        )
        .group_by(User.display_name, Transcription.user_id, day_col)
        .order_by(Transcription.user_id)
    ).all()

    def _as_date(value) -> date:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))

    days_by_user: dict[str, tuple[str, set[date]]] = {}
    for display_name, user_id, day in rows:
        uid = str(user_id)
        if uid not in days_by_user:
            days_by_user[uid] = (display_name, set())
        days_by_user[uid][1].add(_as_date(day))

    today = datetime.now(UTC).date()
    results = []
    for display_name, active_days in days_by_user.values():
        streak = _compute_streak(active_days, today)
        if streak > 0:
            results.append({"display_name": _anonymize(display_name), "streak": streak})

    results.sort(key=lambda x: x["streak"], reverse=True)
    return results[:limit]


def clear_cache() -> None:
    _cache.update({"data": None, "expires_at": 0.0})
    _cache_week.update({"data": None, "expires_at": 0.0})
    _streak_cache.update({"data": None, "expires_at": 0.0})
