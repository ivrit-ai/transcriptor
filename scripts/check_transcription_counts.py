"""Adhoc check: find lines whose transcription_count is out of sync with the
actual number of transcriptions rows for that line in the database.

Reads DATABASE_URL from .env.prod.tmp via python-dotenv and connects directly
through SQLAlchemy, so we never hardcode / echo the connection string.
Run with:  uv run python check_transcription_counts.py [--fix]
"""

import argparse

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.engine import create_engine


def db_url_from_env(env_path: str) -> str:
    loaded = load_dotenv(env_path)
    url = None
    if loaded:
        from os import environ

        url = environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            f"No DATABASE_URL found in {env_path!r} (load_dotenv returned {loaded}). "
            "Refusing to fall back to any other python-dotenv/OS env source."
        )
    return url


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default=".env.prod.tmp", help="Dotenv file with DATABASE_URL")
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Write the correct transcription_count back to the DB when out of sync",
    )
    args = parser.parse_args()

    url = db_url_from_env(args.env)
    engine = create_engine(url)
    with engine.begin() as conn:
        # Compare stored count vs real row count per line.
        rows = conn.execute(
            text(
                """
                SELECT l.id, l.page_id, l.external_id, l.transcription_count AS stored,
                       COUNT(t.id) AS actual
                FROM lines l
                LEFT JOIN transcriptions t ON t.line_id = l.id
                GROUP BY l.id, l.page_id, l.external_id, l.transcription_count
                HAVING COUNT(t.id) <> l.transcription_count
                ORDER BY l.id
                """
            )
        ).mappings()
        mismatches = list(rows)

    if not mismatches:
        print("OK: all lines' transcription_count matches the actual transcription count.")
        return

    print(f"Found {len(mismatches)} line(s) with out-of-sync transcription_count:\n")
    print(f"{'line id':<38} {'page id':<38} {'external_id':<20} {'stored':>7} {'actual':>7}")
    print("-" * 115)
    for r in mismatches:
        print(
            f"{r['id']!s:<38} {r['page_id']!s:<38} {str(r['external_id'])[:20]:<20} "
            f"{r['stored']:>7} {r['actual']:>7}"
        )

    if args.fix:
        with engine.begin() as conn:
            for r in mismatches:
                conn.execute(
                    text("UPDATE lines SET transcription_count = :n WHERE id = :id"),
                    {"n": r["actual"], "id": r["id"]},
                )
        print(f"\nFixed {len(mismatches)} line(s).")


if __name__ == "__main__":
    main()