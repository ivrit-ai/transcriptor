import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_curator
from app.models.batch import Batch
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User
from app.services import import_runner
from app.storage import resolve_image_url

router = APIRouter()

_COMPLETION_TARGET = 3


@router.get("/curator/check")
def curator_check(
    _: Annotated[User, Depends(require_curator)],
) -> dict:
    """Lightweight endpoint the frontend uses to verify curator access."""
    return {"ok": True}


@router.get("/stats")
def admin_stats(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    total_users: int = db.execute(select(func.count(User.id))).scalar_one()

    active_today: int = db.execute(
        select(func.count(func.distinct(Transcription.user_id))).where(
            Transcription.updated_at >= today_start
        )
    ).scalar_one()

    active_week: int = db.execute(
        select(func.count(func.distinct(Transcription.user_id))).where(
            Transcription.updated_at >= week_start
        )
    ).scalar_one()

    total_transcriptions: int = db.execute(
        select(func.count(Transcription.id))
    ).scalar_one()

    text_transcriptions: int = db.execute(
        select(func.count(Transcription.id)).where(
            Transcription.kind == TranscriptionKind.text
        )
    ).scalar_one()

    total_lines: int = db.execute(select(func.count(Line.id))).scalar_one()
    complete_lines: int = db.execute(
        select(func.count(Line.id)).where(Line.transcription_count >= _COMPLETION_TARGET)
    ).scalar_one()

    completion_pct = round(100.0 * complete_lines / total_lines, 1) if total_lines else 0.0

    return {
        "total_users": total_users,
        "active_today": active_today,
        "active_this_week": active_week,
        "total_transcriptions": total_transcriptions,
        "text_transcriptions": text_transcriptions,
        "overall_completion_pct": completion_pct,
    }


@router.get("/users")
def admin_users(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    rows = db.execute(
        select(
            User.id,
            User.display_name,
            User.email,
            User.role,
            User.created_at,
            func.max(Transcription.updated_at).label("last_active"),
            func.count(Transcription.id).label("total_submissions"),
            func.count(
                case((Transcription.kind == TranscriptionKind.text, Transcription.id))
            ).label("text_count"),
            func.count(
                case((Transcription.kind == TranscriptionKind.cant_read, Transcription.id))
            ).label("cant_read_count"),
            func.count(
                case((
                    Transcription.kind.in_([
                        TranscriptionKind.bad_crop,
                        TranscriptionKind.not_hebrew,
                        TranscriptionKind.not_text,
                    ]),
                    Transcription.id,
                ))
            ).label("flag_count"),
        )
        .outerjoin(Transcription, Transcription.user_id == User.id)
        .group_by(User.id, User.display_name, User.email, User.role, User.created_at)
        .order_by(func.count(
            case((Transcription.kind == TranscriptionKind.text, Transcription.id))
        ).desc())
    ).mappings().all()

    return [
        {
            "user_id": str(r["id"]),
            "display_name": r["display_name"],
            "email": r["email"],
            "role": r["role"],
            "joined_at": r["created_at"].isoformat() if r["created_at"] else None,
            "last_active": r["last_active"].isoformat() if r["last_active"] else None,
            "total_submissions": r["total_submissions"],
            "text_count": r["text_count"],
            "cant_read_count": r["cant_read_count"],
            "flag_count": r["flag_count"],
        }
        for r in rows
    ]


_VALID_ROLES = {"user", "curator", "admin"}


class UpdateUserRequest(BaseModel):
    role: str


@router.patch("/users/{user_id}")
def admin_update_user(
    user_id: str,
    body: UpdateUserRequest,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    if body.role not in _VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid role. Must be one of: {', '.join(sorted(_VALID_ROLES))}",
        )
    try:
        uid = uuid.UUID(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid user_id") from e

    target = db.get(User, uid)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.role = body.role
    db.commit()
    return {"user_id": str(target.id), "role": target.role}


@router.get("/coverage")
def admin_coverage(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    rows = db.execute(
        select(
            Batch.id,
            Batch.external_id,
            Batch.source,
            func.count(func.distinct(Page.id)).label("total_pages"),
            func.count(Line.id).label("total_lines"),
            func.count(
                case((Line.transcription_count > 0, Line.id))
            ).label("lines_with_any"),
            func.count(
                case((Line.transcription_count >= _COMPLETION_TARGET, Line.id))
            ).label("lines_complete"),
        )
        .join(Page, Page.batch_id == Batch.id)
        .join(Line, Line.page_id == Page.id)
        .group_by(Batch.id, Batch.external_id, Batch.source)
        .order_by(Batch.external_id)
    ).mappings().all()

    return [
        {
            "batch_id": str(r["id"]),
            "external_id": r["external_id"],
            "source": r["source"],
            "total_pages": r["total_pages"],
            "total_lines": r["total_lines"],
            "lines_with_any": r["lines_with_any"],
            "lines_complete": r["lines_complete"],
            "completion_pct": round(
                100.0 * r["lines_complete"] / r["total_lines"], 1
            ) if r["total_lines"] else 0.0,
        }
        for r in rows
    ]


@router.get("/pages")
def admin_pages(
    _: Annotated[User, Depends(require_curator)],
    db: Annotated[Session, Depends(get_db)],
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Flat paginated list of manuscript pages ordered by (batch, page).
    Each item carries its batch info for display.
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    total: int = db.execute(select(func.count(Page.id))).scalar_one()
    approved_count: int = db.execute(
        select(func.count(Page.id)).where(Page.approved.is_(True))
    ).scalar_one()

    rows = db.execute(
        select(
            Page.id,
            Page.external_id,
            Page.image_path,
            Page.approved,
            Batch.id.label("batch_id"),
            Batch.external_id.label("batch_external_id"),
            Batch.source,
        )
        .join(Batch, Batch.id == Page.batch_id)
        .order_by(Batch.external_id, Page.external_id)
        .offset(offset)
        .limit(page_size)
    ).mappings().all()

    items = [
        {
            "page_id": str(r["id"]),
            "page_external_id": r["external_id"],
            "image_path": r["image_path"],
            "approved": r["approved"],
            "batch_id": str(r["batch_id"]),
            "batch_external_id": r["batch_external_id"],
            "source": r["source"],
        }
        for r in rows
    ]

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "approved_count": approved_count,
        "total_pages": (total + page_size - 1) // page_size if page_size else 0,
    }


@router.get("/page_lines")
def admin_page_lines(
    _: Annotated[User, Depends(require_curator)],
    db: Annotated[Session, Depends(get_db)],
    page_id: str,
) -> dict:
    try:
        pid = uuid.UUID(page_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid page_id") from e

    page = db.get(Page, pid)
    if page is None:
        raise HTTPException(status_code=404, detail="page not found")

    lines = db.execute(
        select(Line)
        .where(Line.page_id == page.id)
        .order_by(Line.line_index)
    ).scalars().all()

    return {
        "page_id": str(page.id),
        "external_id": page.external_id,
        "batch_external_id": page.batch.external_id,
        "document_name": page.document_name,
        "image_url": resolve_image_url(page.image_path),
        "width_px": page.width_px,
        "height_px": page.height_px,
        "image_rotation": page.image_rotation,
        "approved": page.approved,
        "lines": [
            {
                "id": str(line.id),
                "external_id": line.external_id,
                "line_index": line.line_index,
                "bbox": line.bbox,
                "polygon": line.polygon,
                "transcription_count": line.transcription_count,
            }
            for line in lines
        ],
    }


# ── Curation save (update page lines, rotation, approval) ────────────────────


class UpdatePageLinesRequest(BaseModel):
    rotation: int | None = None
    lines: list[dict] | None = None
    approved: bool | None = None


@router.put("/page_lines")
def update_page_lines(
    _: Annotated[User, Depends(require_curator)],
    db: Annotated[Session, Depends(get_db)],
    page_id: str,
    body: UpdatePageLinesRequest,
) -> dict:
    if body.rotation is not None and body.lines is None:
        raise HTTPException(
            status_code=422,
            detail="lines must be provided when rotation is specified",
        )

    try:
        pid = uuid.UUID(page_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid page_id") from e

    page = db.get(Page, pid)
    if page is None:
        raise HTTPException(status_code=404, detail="page not found")

    if body.rotation is not None:
        page.image_rotation = body.rotation

    if body.approved is not None:
        page.approved = body.approved

    update_line_ids: list[str] | None = None

    if body.lines is not None:
        db.query(Line).filter(Line.page_id == page.id).delete()
        new_lines = []
        # Sort lines by visual flow: top-to-bottom (y asc), right-to-left (x+w desc)
        sorted_lines = sorted(
            body.lines,
            key=lambda ld: (ld["bbox"]["y"], -(ld["bbox"]["x"] + ld["bbox"]["w"])),
        )
        for idx, line_data in enumerate(sorted_lines):
            new_line = Line(
                page_id=page.id,
                line_index=idx,
                bbox=line_data["bbox"],
                polygon=line_data.get("polygon"),
                detection_confidence=line_data.get("detection_confidence"),
                external_id=line_data["external_id"],
                transcription_count=line_data.get("transcription_count", 0),
            )
            db.add(new_line)
            new_lines.append(new_line)
        db.flush()
        update_line_ids = [str(l.id) for l in new_lines]

    db.commit()
    db.refresh(page)

    return {
        "page_id": str(page.id),
        "image_rotation": page.image_rotation,
        "approved": page.approved,
        "line_ids": update_line_ids,
    }


@router.get("/queue")
def admin_queue(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    line_stats = db.execute(
        select(
            func.count(Line.id).label("total"),
            func.count(case((Line.transcription_count == 0, Line.id))).label("untouched"),
            func.count(case((
                (Line.transcription_count > 0) & (Line.transcription_count < _COMPLETION_TARGET),
                Line.id,
            ))).label("in_progress"),
            func.count(
                case((Line.transcription_count >= _COMPLETION_TARGET, Line.id))
            ).label("complete"),
        )
    ).mappings().one()

    pages_complete: int = db.execute(
        select(func.count(Page.id)).where(
            ~select(Line.id)
            .where(
                Line.page_id == Page.id,
                Line.transcription_count < _COMPLETION_TARGET,
            )
            .exists()
        )
    ).scalar_one()

    batches_complete: int = db.execute(
        select(func.count(Batch.id)).where(
            ~select(Page.id)
            .join(Line, Line.page_id == Page.id)
            .where(
                Page.batch_id == Batch.id,
                Line.transcription_count < _COMPLETION_TARGET,
            )
            .exists()
        )
    ).scalar_one()

    return {
        "total_lines": line_stats["total"],
        "lines_untouched": line_stats["untouched"],
        "lines_in_progress": line_stats["in_progress"],
        "lines_complete": line_stats["complete"],
        "pages_complete": pages_complete,
        "batches_complete": batches_complete,
    }


# ── Source-data import ────────────────────────────────────────────────────────


class ImportStartRequest(BaseModel):
    mode: Literal["local-folder", "default-s3", "custom-s3"]
    source: str
    license: str
    # local-folder: filesystem path on the server. default-s3: optional key
    # prefix within the configured bucket. custom-s3: full s3://bucket/prefix URI.
    data_path: str | None = None
    clear_existing: bool = False
    # custom-s3 only. Passed to the subprocess via env, never stored or returned.
    s3_key: str | None = None
    s3_secret: str | None = None
    s3_region: str | None = None


@router.get("/import/status")
def admin_import_status(
    _: Annotated[User, Depends(require_admin)],
) -> dict:
    state = import_runner.get_status()
    return {
        **state.to_public_dict(),
        "default_s3_available": import_runner.default_s3_available(),
    }


@router.get("/import/logs")
def admin_import_logs(
    _: Annotated[User, Depends(require_admin)],
    tail: int | None = None,
) -> dict:
    return {"logs": import_runner.get_logs(tail=tail)}


@router.post("/import")
def admin_import_start(
    _: Annotated[User, Depends(require_admin)],
    body: ImportStartRequest,
) -> dict:
    try:
        state = import_runner.start_import(
            mode=body.mode,
            source=body.source,
            license_=body.license,
            data_path=body.data_path,
            s3_key=body.s3_key,
            s3_secret=body.s3_secret,
            s3_region=body.s3_region,
            clear_existing=body.clear_existing,
        )
    except import_runner.ImportAlreadyRunning as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except import_runner.ImportConfigError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return state.to_public_dict()
