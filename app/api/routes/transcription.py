import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_contribution_consent
from app.models.transcription import TranscriptionKind
from app.models.user import User
from app.services.transcriptions import submit_response

router = APIRouter()


class ResponseBody(BaseModel):
    kind: TranscriptionKind
    text: str | None = None
    time_spent_ms: int | None = None


@router.post("/lines/{line_id}/response")
def submit_line_response(
    line_id: uuid.UUID,
    body: ResponseBody,
    request: Request,
    user: Annotated[User, Depends(require_contribution_consent)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        result = submit_response(
            db,
            user,
            line_id,
            body.kind,
            body.text,
            time_spent_ms=body.time_spent_ms,
            user_agent=request.headers.get("user-agent"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "transcription_id": str(result.transcription_id),
        "is_edit": result.is_edit,
        "transcription_count": result.transcription_count,
    }
