"""One-off data fix for lowering `settings.transcription_target`.

`UserProgress.done` is a cached flag written once, at submit time, using
whatever target was active *then* (see `app/services/transcriptions.py::
_upsert_user_progress`). It is never recomputed afterward. Lowering the
target (e.g. 3 -> 1) means many pages that were "not done" under the old
target are now actually complete for that user under the new one, but their
`done` flag stays stale (False) until the user happens to submit on that
page again — which may never happen once a page is "complete".

Stale `done=False` rows are user-visible:
  - GET /api/me/documents shows "active" instead of "done".
  - GET /api/me/contributed-pages (hide_finished=True) keeps listing pages
    the contributor already finished under the new target.
  - Dispatch (app/services/dispatch.py) self-heals on the next request (it
    re-checks live transcription_count), but will waste a query cycle
    walking through stale "unfinished" progress rows before falling back.

Run this once, right after deploying a lowered transcription_target, to
bring every cached `done` flag in line with the new target.

Reads DATABASE_URL from .env.prod.tmp via python-dotenv and connects
directly through SQLAlchemy, so we never hardcode / echo the connection
string.

Usage:
    uv run python scripts/backfill_progress_completion.py --target 1
    uv run python scripts/backfill_progress_completion.py --target 1 --fix
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
        "--target",
        type=int,
        required=True,
        help="The transcription_target currently configured in Settings (e.g. 1)",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Write the recomputed 'done' flag back to the DB when out of sync",
    )
    args = parser.parse_args()

    url = db_url_from_env(args.env)
    engine = create_engine(url)
    with engine.begin() as conn:
        # For every non-skipped progress row, recompute whether the user has
        # any remaining eligible line on that page under the *new* target —
        # mirrors _upsert_user_progress's "remaining" query exactly.
        rows = conn.execute(
            text(
                """
                SELECT
                    up.id,
                    up.user_id,
                    up.page_id,
                    up.done AS stored_done,
                    NOT EXISTS (
                        SELECT 1
                        FROM lines l
                        WHERE l.page_id = up.page_id
                          AND l.transcription_count < :target
                          AND NOT EXISTS (
                              SELECT 1 FROM transcriptions t
                              WHERE t.line_id = l.id AND t.user_id = up.user_id
                          )
                    ) AS computed_done
                FROM user_progress up
                WHERE up.skipped = false
                """
            ),
            {"target": args.target},
        ).mappings()
        mismatches = [r for r in rows if r["stored_done"] != r["computed_done"]]

    if not mismatches:
        print(f"OK: all user_progress.done flags already match target={args.target}.")
        return

    print(
        f"Found {len(mismatches)} user_progress row(s) whose 'done' flag is "
        f"stale for target={args.target}:\n"
    )
    print(f"{'progress id':<38} {'user id':<38} {'page id':<38} {'stored':>7} {'computed':>9}")
    print("-" * 135)
    for r in mismatches:
        print(
            f"{r['id']!s:<38} {r['user_id']!s:<38} {r['page_id']!s:<38} "
            f"{str(r['stored_done']):>7} {str(r['computed_done']):>9}"
        )

    if args.fix:
        with engine.begin() as conn:
            for r in mismatches:
                conn.execute(
                    text("UPDATE user_progress SET done = :d WHERE id = :id"),
                    {"d": r["computed_done"], "id": r["id"]},
                )
        print(f"\nFixed {len(mismatches)} row(s).")


if __name__ == "__main__":
    main()
