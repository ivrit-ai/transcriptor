import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import _effective_role, get_db, require_admin, require_curator
from app.db import SessionLocal
from app.models.batch import Batch
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription, TranscriptionKind
from app.models.user import User
from app.services import import_runner
from app.storage import resolve_image_url

router = APIRouter()

_COMPLETION_TARGET = 3


@router.get("/curators")
def curator_list(
    _: Annotated[User, Depends(require_curator)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    rows = (
        db.execute(
            select(User.id, User.email).where(User.role.in_(["curator", "admin"]))
        )
        .mappings()
        .all()
    )
    return [{"user_id": str(r["id"]), "email": r["email"]} for r in rows]


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
        select(func.count(Line.id)).where(
            Line.transcription_count >= _COMPLETION_TARGET
        )
    ).scalar_one()

    completion_pct = (
        round(100.0 * complete_lines / total_lines, 1) if total_lines else 0.0
    )

    total_words: int = db.execute(
        select(
            func.coalesce(
                func.sum(
                    func.array_length(
                        func.string_to_array(func.btrim(Transcription.text), " "), 1
                    )
                ),
                0,
            )
        ).where(
            Transcription.kind == TranscriptionKind.text,
            Transcription.text.isnot(None),
            func.btrim(Transcription.text) != "",
        )
    ).scalar_one()

    return {
        "total_users": total_users,
        "active_today": active_today,
        "active_this_week": active_week,
        "total_transcriptions": total_transcriptions,
        "text_transcriptions": text_transcriptions,
        "overall_completion_pct": completion_pct,
        "total_words": int(total_words),
    }


@router.get("/users")
def admin_users(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    rows = (
        db.execute(
            select(
                User.id,
                User.display_name,
                User.email,
                User.role,
                User.created_at,
                func.max(Transcription.updated_at).label("last_active"),
                func.count(Transcription.id).label("total_submissions"),
                func.count(
                    case(
                        (Transcription.kind == TranscriptionKind.text, Transcription.id)
                    )
                ).label("text_count"),
                func.count(
                    case(
                        (
                            Transcription.kind == TranscriptionKind.cant_read,
                            Transcription.id,
                        )
                    )
                ).label("cant_read_count"),
                func.count(
                    case(
                        (
                            Transcription.kind.in_(
                                [
                                    TranscriptionKind.bad_crop,
                                    TranscriptionKind.not_hebrew,
                                    TranscriptionKind.not_text,
                                ]
                            ),
                            Transcription.id,
                        )
                    )
                ).label("flag_count"),
            )
            .outerjoin(Transcription, Transcription.user_id == User.id)
            .group_by(
                User.id, User.display_name, User.email, User.role, User.created_at
            )
            .order_by(
                func.count(
                    case(
                        (Transcription.kind == TranscriptionKind.text, Transcription.id)
                    )
                ).desc()
            )
        )
        .mappings()
        .all()
    )

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
    rows = (
        db.execute(
            select(
                Batch.id,
                Batch.external_id,
                Batch.source,
                func.count(func.distinct(Page.id)).label("total_pages"),
                func.count(Line.id).label("total_lines"),
                func.count(case((Line.transcription_count > 0, Line.id))).label(
                    "lines_with_any"
                ),
                func.count(
                    case((Line.transcription_count >= _COMPLETION_TARGET, Line.id))
                ).label("lines_complete"),
            )
            .join(Page, Page.batch_id == Batch.id)
            .join(Line, Line.page_id == Page.id)
            .group_by(Batch.id, Batch.external_id, Batch.source)
            .order_by(Batch.external_id)
        )
        .mappings()
        .all()
    )

    return [
        {
            "batch_id": str(r["id"]),
            "external_id": r["external_id"],
            "source": r["source"],
            "total_pages": r["total_pages"],
            "total_lines": r["total_lines"],
            "lines_with_any": r["lines_with_any"],
            "lines_complete": r["lines_complete"],
            "completion_pct": round(100.0 * r["lines_complete"] / r["total_lines"], 1)
            if r["total_lines"]
            else 0.0,
        }
        for r in rows
    ]


_VALID_PAGE_STATUSES = {"approved", "rejected"}


@router.get("/batches")
def admin_batches(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    rows = (
        db.execute(
            select(Batch.id, Batch.external_id, Batch.source, Batch.license).order_by(
                Batch.external_id
            )
        )
        .mappings()
        .all()
    )
    return [
        {
            "id": str(r["id"]),
            "external_id": r["external_id"],
            "source": r["source"],
            "license": r["license"],
        }
        for r in rows
    ]


@router.get("/pages")
def admin_pages(
    caller: Annotated[User, Depends(require_curator)],
    db: Annotated[Session, Depends(get_db)],
    page: int = 1,
    page_size: int = 50,
    status: Annotated[list[str] | None, Query()] = None,
    batch_id: str | None = Query(None),
) -> dict:
    """
    Flat paginated list of manuscript pages ordered by (batch, page).
    Each item carries its batch info for display.

    `status` is a repeatable filter (`?status=approved&status=rejected`).
    Omitted/empty means no filtering (all pages). When multiple values are
    given they are OR'd together (e.g. both -> approved OR rejected).
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    statuses = set(status or [])
    invalid = statuses - _VALID_PAGE_STATUSES
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status filter(s): {', '.join(sorted(invalid))}",
        )

    batch_uuid: uuid.UUID | None = None
    if batch_id is not None:
        if _effective_role(caller) != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        try:
            batch_uuid = uuid.UUID(batch_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid batch_id") from e

    status_filter = None
    if statuses:
        conds = []
        if "approved" in statuses:
            conds.append(Page.approved.is_(True))
        if "rejected" in statuses:
            conds.append(Page.rejected.is_(True))
        status_filter = or_(*conds)

    total_lines_sq = (
        select(func.count(Line.id))
        .where(Line.page_id == Page.id)
        .correlate(Page)
        .scalar_subquery()
    )
    annotated_lines_sq = (
        select(func.count(Line.id))
        .where(Line.page_id == Page.id, Line.transcription_count >= 1)
        .correlate(Page)
        .scalar_subquery()
    )

    count_query = select(func.count(Page.id))
    approved_count_query = select(func.count(Page.id)).where(Page.approved.is_(True))
    rows_query = (
        select(
            Page.id,
            Page.external_id,
            Page.image_path,
            Page.approved,
            Page.approved_by,
            Page.rejected,
            Page.rejected_by,
            Page.updated_at,
            Batch.id.label("batch_id"),
            Batch.external_id.label("batch_external_id"),
            Batch.source,
            total_lines_sq.label("total_lines"),
            annotated_lines_sq.label("annotated_lines"),
        )
        .join(Batch, Batch.id == Page.batch_id)
        .order_by(Batch.external_id, Page.external_id)
    )

    if batch_uuid is not None:
        count_query = count_query.where(Page.batch_id == batch_uuid)
        approved_count_query = approved_count_query.where(Page.batch_id == batch_uuid)
        rows_query = rows_query.where(Page.batch_id == batch_uuid)

    if status_filter is not None:
        count_query = count_query.where(status_filter)
        rows_query = rows_query.where(status_filter)

    total: int = db.execute(count_query).scalar_one()
    approved_count: int = db.execute(approved_count_query).scalar_one()

    rows = (
        db.execute(rows_query.offset(offset).limit(page_size)).mappings().all()
    )

    items = [
        {
            "page_id": str(r["id"]),
            "page_external_id": r["external_id"],
            "image_path": r["image_path"],
            "approved": r["approved"],
            "approved_by": str(r["approved_by"]) if r["approved_by"] else None,
            "rejected": r["rejected"],
            "rejected_by": str(r["rejected_by"]) if r["rejected_by"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            "batch_id": str(r["batch_id"]),
            "batch_external_id": r["batch_external_id"],
            "source": r["source"],
            "total_lines": r["total_lines"],
            "annotated_lines": r["annotated_lines"],
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

    lines = (
        db.execute(
            select(Line).where(Line.page_id == page.id).order_by(Line.line_index)
        )
        .scalars()
        .all()
    )

    line_ids = [line.id for line in lines]
    txn_rows = (
        db.execute(
            select(
                Transcription.line_id,
                Transcription.user_id,
                Transcription.kind,
                Transcription.text,
                Transcription.created_at,
                Transcription.updated_at,
                User.email,
                User.display_name,
            )
            .join(User, User.id == Transcription.user_id)
            .where(Transcription.line_id.in_(line_ids))
        )
        .mappings()
        .all()
    )

    txn_by_line: dict[uuid.UUID, list[dict]] = {}
    for t in txn_rows:
        txn_by_line.setdefault(t["line_id"], []).append(
            {
                "user_id": str(t["user_id"]),
                "display_name": t["display_name"],
                "email": t["email"],
                "kind": t["kind"],
                "text": t["text"],
                "created_at": t["created_at"].isoformat(),
                "updated_at": t["updated_at"].isoformat(),
            }
        )

    # Global 0-based position of this page within the *unfiltered*, stably
    # ordered (batch_external_id, page_external_id) dataset. Lets the curate
    # screen navigate prev/next across the whole dataset without depending on
    # whatever filter produced the list the user arrived from.
    batch_external_id = page.batch.external_id
    rank: int = db.execute(
        select(func.count(Page.id))
        .join(Batch, Batch.id == Page.batch_id)
        .where(
            or_(
                Batch.external_id < batch_external_id,
                and_(
                    Batch.external_id == batch_external_id,
                    Page.external_id < page.external_id,
                ),
            )
        )
    ).scalar_one()
    dataset_total: int = db.execute(select(func.count(Page.id))).scalar_one()

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
        "rejected": page.rejected,
        "rank": rank,
        "dataset_total": dataset_total,
        "lines": [
            {
                "id": str(line.id),
                "external_id": line.external_id,
                "line_index": line.line_index,
                "bbox": line.bbox,
                "polygon": line.polygon,
                "detection_confidence": line.detection_confidence,
                "transcription_count": line.transcription_count,
                "transcriptions": txn_by_line.get(line.id, []),
            }
            for line in lines
        ],
    }


# ── Curation save (update page lines, rotation, approval) ────────────────────


class UpdatePageLinesRequest(BaseModel):
    rotation: int | None = None
    lines: list[dict] | None = None
    approved: bool | None = None
    rejected: bool | None = None


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

    if body.rejected is not None and body.approved is not None:
        if body.rejected and body.approved:
            raise HTTPException(
                status_code=422,
                detail="cannot specify both approved and rejected",
            )

    if body.rejected is not None:
        page.rejected = body.rejected
        page.rejected_by = _.id if body.rejected else None
        if body.rejected:
            page.approved = False
            page.approved_by = None

    if body.approved is not None:
        page.approved = body.approved
        page.approved_by = _.id if body.approved else None
        if body.approved:
            page.rejected = False
            page.rejected_by = None

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
        "rejected": page.rejected,
        "line_ids": update_line_ids,
    }


@router.get("/export")
def admin_export(
    _: Annotated[User, Depends(require_admin)],
) -> StreamingResponse:
    q = (
        select(
            Line.id.label("line_id"),
            Line.external_id.label("line_external_id"),
            Line.line_index,
            Line.bbox,
            Line.polygon,
            Line.detection_confidence,
            Page.id.label("page_id"),
            Page.external_id.label("page_external_id"),
            Page.document_name,
            Page.image_path,
            Batch.id.label("batch_id"),
            Batch.external_id.label("batch_external_id"),
            Batch.source,
            Batch.license,
            Transcription.user_id,
            Transcription.kind,
            Transcription.text,
            Transcription.created_at.label("txn_created_at"),
            Transcription.updated_at.label("txn_updated_at"),
            User.email,
            User.display_name,
        )
        .join(Page, Page.id == Line.page_id)
        .join(Batch, Batch.id == Page.batch_id)
        .join(Transcription, Transcription.line_id == Line.id)
        .join(User, User.id == Transcription.user_id)
        .where(Line.transcription_count >= 1)
        .order_by(Batch.external_id, Page.external_id, Line.line_index, Transcription.user_id)
    )

    def generate():
        # Opens its own session so the DI-managed session is not closed
        # before Starlette begins iterating this generator.
        with SessionLocal() as db:
            current_line_id = None
            current_record: dict | None = None
            for row in db.execute(q).mappings():
                lid = row["line_id"]
                if lid != current_line_id:
                    if current_record is not None:
                        yield json.dumps(current_record, ensure_ascii=False) + "\n"
                    current_line_id = lid
                    current_record = {
                        "line_id": str(lid),
                        "external_id": row["line_external_id"],
                        "line_index": row["line_index"],
                        "bbox": row["bbox"],
                        "polygon": row["polygon"],
                        "detection_confidence": row["detection_confidence"],
                        "page": {
                            "id": str(row["page_id"]),
                            "external_id": row["page_external_id"],
                            "document_name": row["document_name"],
                            "image_path": row["image_path"],
                        },
                        "batch": {
                            "id": str(row["batch_id"]),
                            "external_id": row["batch_external_id"],
                            "source": row["source"],
                            "license": row["license"],
                        },
                        "transcriptions": [],
                    }
                current_record["transcriptions"].append(  # type: ignore[index]
                    {
                        "user_id": str(row["user_id"]),
                        "email": row["email"],
                        "display_name": row["display_name"],
                        "kind": row["kind"].value,
                        "text": row["text"],
                        "created_at": row["txn_created_at"].isoformat(),
                        "updated_at": row["txn_updated_at"].isoformat(),
                    }
                )
            if current_record is not None:
                yield json.dumps(current_record, ensure_ascii=False) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": 'attachment; filename="transcriptor_export.jsonl"'},
    )


@router.get("/queue")
def admin_queue(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    line_stats = (
        db.execute(
            select(
                func.count(Line.id).label("total"),
                func.count(case((Line.transcription_count == 0, Line.id))).label(
                    "untouched"
                ),
                func.count(
                    case(
                        (
                            (Line.transcription_count > 0)
                            & (Line.transcription_count < _COMPLETION_TARGET),
                            Line.id,
                        )
                    )
                ).label("in_progress"),
                func.count(
                    case((Line.transcription_count >= _COMPLETION_TARGET, Line.id))
                ).label("complete"),
            )
        )
        .mappings()
        .one()
    )

    # pages_started: at least one line touched
    pages_started: int = db.execute(
        select(func.count(func.distinct(Line.page_id))).where(
            Line.transcription_count > 0
        )
    ).scalar_one()

    # pages_covered: every line has >= 1 transcription
    pages_covered: int = db.execute(
        select(func.count(Page.id)).where(
            select(Line.id).where(Line.page_id == Page.id).exists(),
            ~select(Line.id)
            .where(Line.page_id == Page.id, Line.transcription_count < 1)
            .exists(),
        )
    ).scalar_one()

    # pages_complete: every line has >= COMPLETION_TARGET transcriptions
    pages_complete: int = db.execute(
        select(func.count(Page.id)).where(
            select(Line.id).where(Line.page_id == Page.id).exists(),
            ~select(Line.id)
            .where(
                Line.page_id == Page.id,
                Line.transcription_count < _COMPLETION_TARGET,
            )
            .exists(),
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
        "lines_with_any": line_stats["total"] - line_stats["untouched"],
        "lines_in_progress": line_stats["in_progress"],
        "lines_complete": line_stats["complete"],
        "pages_started": pages_started,
        "pages_covered": pages_covered,
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
