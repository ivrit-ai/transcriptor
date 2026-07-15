import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_contribution_consent
from app.models.event import Event
from app.models.line import Line
from app.models.page import Page
from app.models.user import User
from app.services.dispatch import SessionDTO, get_next_session, get_session_for_page, mark_page_skipped

router = APIRouter()

_MAX_REPORT_LENGTH = 2000


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


# ── User-reported problems ────────────────────────────────────────────────────
#
# Reuses the existing generic `Event` model rather than introducing a new
# table: `event_type="reported_problem"` events are always tied to the acting
# user (Event.user_id, NOT NULL) and, when the reporter was focused on a
# specific line, to that line (Event.line_id). The page/batch the user was
# working on when they reported the problem is captured explicitly in
# `payload` (page_id, page_external_id, batch_id, batch_external_id) — the
# same pattern already used by `skip_page` above for page-scoped events that
# have no dedicated column on Event. This keeps the report queryable via
# Event.line_id -> Line.page_id as well as directly via payload, without a
# migration.


class ReportProblemBody(BaseModel):
    description: str
    line_id: uuid.UUID | None = None


@router.post("/pages/{page_id}/report", status_code=201)
def report_problem(
    page_id: uuid.UUID,
    body: ReportProblemBody,
    request: Request,
    user: Annotated[User, Depends(require_contribution_consent)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    description = body.description.strip()
    if not description:
        raise HTTPException(status_code=422, detail="description is required")
    if len(description) > _MAX_REPORT_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"description too long (max {_MAX_REPORT_LENGTH} chars)",
        )

    page = db.get(Page, page_id)
    if page is None:
        raise HTTPException(status_code=404, detail="page not found")

    if body.line_id is not None:
        line = db.get(Line, body.line_id)
        if line is None or line.page_id != page.id:
            raise HTTPException(
                status_code=422, detail="line_id does not belong to page_id"
            )

    event = Event(
        user_id=user.id,
        line_id=body.line_id,
        event_type="reported_problem",
        payload={
            "description": description,
            "page_id": str(page.id),
            "page_external_id": page.external_id,
            "batch_id": str(page.batch_id),
            "batch_external_id": page.batch.external_id,
            "user_agent": request.headers.get("user-agent"),
        },
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"event_id": str(event.id)}
