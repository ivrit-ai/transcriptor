import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_contribution_consent
from app.models.event import Event
from app.models.user import User
from app.services.dispatch import SessionDTO, get_next_session, get_session_for_page, mark_page_skipped

router = APIRouter()


@router.get("/next-session", response_model=None)
def next_session(
    user: Annotated[User, Depends(require_contribution_consent)],
    db: Annotated[Session, Depends(get_db)],
):
    result = get_next_session(db, user)
    if result is None:
        return Response(status_code=204)
    return result


@router.get("/sessions/{page_id}", response_model=None)
def session_for_page(
    page_id: uuid.UUID,
    user: Annotated[User, Depends(require_contribution_consent)],
    db: Annotated[Session, Depends(get_db)],
):
    result = get_session_for_page(db, user, page_id)
    if result is None:
        return Response(status_code=404)
    return result


@router.post("/pages/{page_id}/skip", status_code=204)
def skip_page(
    page_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(require_contribution_consent)],
    db: Annotated[Session, Depends(get_db)],
):
    mark_page_skipped(db, user, page_id)
    db.add(Event(
        user_id=user.id,
        line_id=None,
        event_type="skipped",
        payload={
            "page_id": str(page_id),
            "user_agent": request.headers.get("user-agent"),
        },
    ))
    db.flush()
    return Response(status_code=204)
