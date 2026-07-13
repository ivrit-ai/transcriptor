"""Export dataset as JSONL (one record per line, all transcriptions included).

Usage:
    uv run python scripts/export_dataset.py [output.jsonl]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import SessionLocal
from app.models.batch import Batch
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription


def export_dataset(session: Session) -> list[dict]:
    lines = session.execute(
        select(Line)
        .options(
            joinedload(Line.page).joinedload(Page.batch),
            joinedload(Line.transcriptions),
        )
    ).unique().scalars().all()

    records = []
    for line in lines:
        page = line.page
        batch = page.batch
        records.append({
            "line_id": str(line.id),
            "external_id": line.external_id,
            "line_index": line.line_index,
            "bbox": line.bbox,
            "polygon": line.polygon,
            "detection_confidence": line.detection_confidence,
            "page": {
                "id": str(page.id),
                "external_id": page.external_id,
                "image_path": page.image_path,
                "image_rotation": page.image_rotation,
                "width_px": page.width_px,
                "height_px": page.height_px,
            },
            "batch": {
                "id": str(batch.id),
                "external_id": batch.external_id,
                "source": batch.source,
                "license": batch.license,
            },
            "transcriptions": [
                {
                    "id": str(t.id),
                    "user_id": str(t.user_id),
                    "kind": t.kind.value,
                    "text": t.text,
                    "created_at": t.created_at.isoformat(),
                    "updated_at": t.updated_at.isoformat(),
                }
                for t in line.transcriptions
            ],
        })
    return records


def main() -> None:
    output_path = sys.argv[1] if len(sys.argv) > 1 else None
    with SessionLocal() as session:
        records = export_dataset(session)
    output = "\n".join(json.dumps(r) for r in records)
    if output_path:
        Path(output_path).write_text(output)
    else:
        print(output)


if __name__ == "__main__":
    main()
