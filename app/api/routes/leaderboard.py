from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.leaderboard import CACHE_TTL, get_leaderboard, get_streak_leaders

router = APIRouter()


@router.get("/leaderboard")
def leaderboard(
    db: Annotated[Session, Depends(get_db)],
    period: Literal["all", "week"] = Query(default="all"),
) -> list:
    since = datetime.now(UTC) - timedelta(days=7) if period == "week" else None
    return get_leaderboard(db, ttl=CACHE_TTL, since=since)


@router.get("/leaderboard/streaks")
def leaderboard_streaks(
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=10, ge=1, le=50),
) -> list:
    return get_streak_leaders(db, limit=limit, ttl=CACHE_TTL)
