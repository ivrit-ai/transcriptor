"""Import source-data (worker output) into the database.

Supports local directory or S3 URI as the data root.

Usage:
    uv run python scripts/import_source_data.py <path_or_s3_uri> \
        --source <source_name> --license <license>

Examples:
    uv run python scripts/import_source_data.py data/output/ \
        --source handwriting_form --license CC-BY-4.0

    uv run python scripts/import_source_data.py s3://my-bucket/data/ \
        --source handwriting_form --license CC-BY-4.0 \
        --s3-key <key> --s3-secret <secret> --s3-region <region>
"""
import argparse
import csv
import json
import os
import sys
import tempfile
from pathlib import Path

# ── DB setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.batch import Batch
from app.models.event import Event
from app.models.line import Line
from app.models.page import Page
from app.models.transcription import Transcription
from app.services.rules import mint_line_external_id


# ── S3 helpers ──────────────────────────────────────────────────────────────

def _is_s3_uri(path: str) -> bool:
    return path.startswith("s3://")


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    """Return (bucket, key_prefix) from s3://bucket/prefix/."""
    without = uri.removeprefix("s3://").rstrip("/")
    parts = without.split("/", 1)
    bucket = parts[0]
    prefix = parts[1] + "/" if len(parts) > 1 else ""
    return bucket, prefix


def _download_s3_to_temp(uri: str, aws_key: str, aws_secret: str, aws_region: str) -> Path:
    """Download only manifests, metadata.json, and lines JSON files from S3.

    Skips image files since they are served directly from the S3 bucket.
    """
    import boto3

    bucket, prefix = _parse_s3_uri(uri)
    s3 = boto3.client(
        "s3",
        aws_access_key_id=aws_key,
        aws_secret_access_key=aws_secret,
        region_name=aws_region,
    )
    tmpdir = Path(tempfile.mkdtemp(prefix="import_source_"))

    # File patterns we actually need for import
    manifest_names = {"submissions.csv", "pages.csv"}

    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/"):
                continue
            rel = key.removeprefix(prefix)
            filename = Path(rel).name

            # Keep: top-level manifests, metadata.json, and lines JSON files
            if filename in manifest_names:
                pass  # always download
            elif filename.endswith(".json"):
                pass  # always download
            else:
                continue  # skip images and everything else

            dest = tmpdir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            s3.download_file(bucket, key, str(dest))

    return tmpdir


# ── Image dimension reader ─────────────────────────────────────────────────

def _image_dims(image_path: Path) -> tuple[int, int]:
    """Return (width, height) using Pillow."""
    with Image.open(image_path) as img:
        return img.size  # (width, height)


# ── Clear existing data ─────────────────────────────────────────────────────

def clear_existing_submissions(session: Session, root: Path) -> None:
    """Delete all submissions (batches + pages + lines) listed in the manifest."""
    submissions_csv = root / "submissions.csv"
    if not submissions_csv.exists():
        print(f"ERROR: {submissions_csv} not found")
        sys.exit(1)

    submission_ids: list[str] = []
    with open(submissions_csv, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            submission_ids.append(row["submission_id"])

    if not submission_ids:
        print("No submissions in manifest, nothing to clear")
        return

    batches = (
        session.execute(select(Batch).where(Batch.external_id.in_(submission_ids)))
        .scalars()
        .all()
    )

    if not batches:
        print("No existing submissions found to clear")
        return

    batch_ids = [b.id for b in batches]
    pages = session.execute(select(Page).where(Page.batch_id.in_(batch_ids))).scalars().all()
    page_ids = [p.id for p in pages]

    if page_ids:
        line_ids_subq = select(Line.id).where(Line.page_id.in_(page_ids))
        session.execute(delete(Event).where(Event.line_id.in_(line_ids_subq)))
        session.execute(delete(Transcription).where(Transcription.line_id.in_(line_ids_subq)))
        session.execute(delete(Line).where(Line.page_id.in_(page_ids)))
    session.execute(delete(Page).where(Page.batch_id.in_(batch_ids)))
    for batch in batches:
        session.delete(batch)

    session.flush()
    print(f"Cleared {len(batches)} submissions ({len(page_ids)} pages)")

# ── Import logic ────────────────────────────────────────────────────────────

def import_source_data(
    session: Session,
    root: Path,
    source: str,
    license_: str,
    remote_images: bool = False,
) -> None:
    submissions_csv = root / "submissions.csv"
    pages_csv = root / "pages.csv"

    if not submissions_csv.exists():
        print(f"ERROR: {submissions_csv} not found")
        sys.exit(1)
    if not pages_csv.exists():
        print(f"ERROR: {pages_csv} not found")
        sys.exit(1)

    # Read submissions
    submissions: list[dict] = []
    with open(submissions_csv, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            submissions.append(row)

    # Read pages and group by submission_id
    pages_by_submission: dict[str, list[dict]] = {}
    with open(pages_csv, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sid = row["submission_id"]
            pages_by_submission.setdefault(sid, []).append(row)

    completed = [s for s in submissions if s["status"] == "completed"]
    print(f"Found {len(completed)} completed submissions out of {len(submissions)} total")

    for sub in completed:
        submission_id = sub["submission_id"]
        sub_dir = root / submission_id
        metadata_path = sub_dir / "metadata.json"

        if not metadata_path.exists():
            print(f"  WARN: metadata.json missing for {submission_id}, skipping")
            continue

        metadata = json.loads(metadata_path.read_text())
        submitter_fingerprint = metadata.get("submitter_fingerprint") if metadata else None

        # Upsert Batch
        batch = session.execute(
            select(Batch).where(Batch.external_id == submission_id)
        ).scalar_one_or_none()
        if batch is None:
            batch = Batch(
                external_id=submission_id,
                source=source,
                license=license_,
                source_metadata=metadata if metadata else None,
                submitter_fingerprint=submitter_fingerprint,
            )
            session.add(batch)
            session.flush()
            print(f"  Created batch {submission_id}")
        else:
            batch.source = source
            batch.license = license_
            batch.submitter_fingerprint = submitter_fingerprint
            if metadata:
                batch.source_metadata = metadata

        # Process pages for this submission
        sub_pages = pages_by_submission.get(submission_id, [])
        completed_pages = [p for p in sub_pages if p["status"] == "completed"]

        for page_row in completed_pages:
            doc_filename = page_row["doc_filename"]
            page_number = int(page_row["page_number"])
            image_filename = page_row["image_filename"]
            lines_filename = page_row.get("lines_filename", "")

            image_path = sub_dir / image_filename
            if not remote_images and not image_path.exists():
                print(f"    WARN: image {image_filename} missing, skipping page")
                continue

            page_external_id = f"{doc_filename}:p{page_number}"
            image_path_relative = f"{submission_id}/{image_filename}"

            width_px, height_px = None, None
            lines_data = None

            if lines_filename:
                lines_path = sub_dir / lines_filename
                if lines_path.exists():
                    lines_data = json.loads(lines_path.read_text())
                    width_px = lines_data.get("image_width")
                    height_px = lines_data.get("image_height")

            if width_px is None or height_px is None:
                if remote_images:
                    print(f"    WARN: no image dimensions for {image_filename}, skipping page")
                    continue
                width_px, height_px = _image_dims(image_path)

            # Upsert Page
            page = session.execute(
                select(Page).where(
                    Page.batch_id == batch.id,
                    Page.external_id == page_external_id,
                )
            ).scalar_one_or_none()
            if page is None:
                page = Page(
                    batch_id=batch.id,
                    external_id=page_external_id,
                    document_name=doc_filename,
                    image_path=image_path_relative,
                    width_px=width_px,
                    height_px=height_px,
                )
                session.add(page)
                session.flush()
            else:
                page.document_name = doc_filename
                page.image_path = image_path_relative
                page.width_px = width_px
                page.height_px = height_px

            # Upsert Lines
            if lines_data is not None:
                for line_entry in lines_data.get("lines", []):
                    line_idx = line_entry["index"]
                    ext_id = mint_line_external_id(
                        submission_id, page_external_id, line_idx
                    )

                    bbox_array = line_entry["bbox"]
                    bbox_dict = {
                        "x": bbox_array[0],
                        "y": bbox_array[1],
                        "w": bbox_array[2] - bbox_array[0],
                        "h": bbox_array[3] - bbox_array[1],
                    }

                    polygon = line_entry.get("polygon")
                    confidence = line_entry.get("confidence")

                    line = session.execute(
                        select(Line).where(
                            Line.page_id == page.id,
                            Line.external_id == ext_id,
                        )
                    ).scalar_one_or_none()
                    if line is None:
                        line = Line(
                            page_id=page.id,
                            external_id=ext_id,
                            line_index=line_idx,
                            bbox=bbox_dict,
                            polygon=polygon,
                            detection_confidence=confidence,
                        )
                        session.add(line)
                    else:
                        line.line_index = line_idx
                        line.bbox = bbox_dict
                        line.polygon = polygon
                        line.detection_confidence = confidence

        print(f"  Processed {len(completed_pages)} pages for {submission_id}")


# ── CLI ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import source-data (worker output) into the database."
    )
    parser.add_argument(
        "source_path",
        help="Local directory path or s3://bucket/prefix/ URI",
    )
    parser.add_argument("--source", required=True, help="Batch source identifier")
    parser.add_argument("--license", required=True, help="License string")
    parser.add_argument(
        "--s3-key",
        help="AWS Access Key ID (or set IMPORT_AWS_ACCESS_KEY_ID)",
    )
    parser.add_argument(
        "--s3-secret",
        help="AWS Secret Access Key (or set IMPORT_AWS_SECRET_ACCESS_KEY)",
    )
    parser.add_argument(
        "--s3-region",
        help="AWS Region (or set IMPORT_AWS_REGION)",
    )
    parser.add_argument(
        "--clear-existing",
        action="store_true",
        help="Delete all submissions (and cascading data) listed in the manifest before importing",
    )

    args = parser.parse_args()

    # S3 credentials: CLI args take precedence, fall back to IMPORT_* env vars.
    s3_key = args.s3_key or os.environ.get("IMPORT_AWS_ACCESS_KEY_ID")
    s3_secret = args.s3_secret or os.environ.get("IMPORT_AWS_SECRET_ACCESS_KEY")
    s3_region = args.s3_region or os.environ.get("IMPORT_AWS_REGION")

    cleanup_temp = False
    remote_images = False
    if _is_s3_uri(args.source_path):
        if not all([s3_key, s3_secret, s3_region]):
            parser.error(
                "S3 credentials required: provide --s3-key/--s3-secret/--s3-region "
                "or set IMPORT_AWS_ACCESS_KEY_ID / IMPORT_AWS_SECRET_ACCESS_KEY / IMPORT_AWS_REGION"
            )
        print(f"Downloading from S3 (manifests only): {args.source_path}")
        root = _download_s3_to_temp(args.source_path, s3_key, s3_secret, s3_region)
        cleanup_temp = True
        remote_images = True
    else:
        root = Path(args.source_path)
        if not root.is_dir():
            print(f"ERROR: {root} is not a directory")
            sys.exit(1)

    try:
        with SessionLocal() as session:
            if args.clear_existing:
                clear_existing_submissions(session, root)
            import_source_data(session, root, args.source, args.license, remote_images)
            session.commit()
        print("Import complete.")
    finally:
        if cleanup_temp:
            import shutil
            shutil.rmtree(root, ignore_errors=True)
            print(f"Cleaned up temp dir: {root}")


if __name__ == "__main__":
    main()
