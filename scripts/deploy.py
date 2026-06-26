#!/usr/bin/env python3
"""Deploy the runtime app (backend + built frontend) to the xhostd git endpoint.

Strategy
--------
1. Build the frontend (``npm run build``) -> ``frontend/dist``.
2. Assemble a "runtime-only" file set:
     - all git-tracked files under the runtime allowlist, so new files (e.g. a new
       ``app/**/*.py``) are picked up automatically -- nothing is hardcoded;
     - the freshly built ``frontend/dist/**`` (gitignored, added explicitly), with
       the ``frontend/dist/`` layout preserved (the server serves it from there,
       see ``app/main.py``).
3. Commit that set as a single fresh (orphan) commit and force-push it to the
   deploy branch on the xhostd git remote.

Git is the transport, so binary files and add/delete tracking are handled
natively -- no base64 encoding hack and no manual file list to keep in sync.

Configuration (env vars, optionally via the repo-root ``.env``)
---------------------------------------------------------------
    XHOST_GIT_URL     (REQUIRED) git push URL of the deployment repo, e.g.
                      https://git.xhostd.com/yanirmr/transcriptor.git
    XHOST_GIT_BRANCH  branch to deploy to (default: master)
    XHOST_TOKEN       optional bearer token. When set, injected as HTTP basic
                      auth credentials into the git URL (useful when your git
                      credential manager is not configured for this host).

Usage
-----
    python scripts/deploy.py [--dry-run] [--skip-build]
"""

from __future__ import annotations

import argparse
import datetime as _dt
import http.client
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse, urlunparse

REPO_ROOT = Path(__file__).resolve().parent.parent

# Tracked paths that should ship to the server. Dev-only paths (tests/, planning/,
# *.md specs, architecture svgs, data*/) are intentionally excluded.
RUNTIME_PATHS = [
    "app",
    "alembic",
    "alembic.ini",
    "scripts",
    "install.sh",
    "launch.sh",
    "pyproject.toml",
    "uv.lock",
]

DEFAULT_GIT_BRANCH = "master"


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (only sets vars that aren't already in the environment)."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def inject_token_into_url(url: str, token: str) -> str:
    """Embed *token* as HTTP basic auth credentials (user + password) into *url*."""
    parsed = urlparse(url)
    return urlunparse(parsed._replace(netloc=f"{token}:{token}@{parsed.hostname}"))


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    """Run a command, echoing it, and raise on failure."""
    print(f"    $ {' '.join(cmd)}")
    return subprocess.run(cmd, check=True, **kwargs)


def git_out(cmd: list[str], env: dict | None = None) -> str:
    return subprocess.run(
        ["git", *cmd],
        check=True,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        env=env,
    ).stdout


def build_frontend() -> None:
    print("==> Building frontend (npm run build)...")
    frontend = REPO_ROOT / "frontend"
    if not (frontend / "node_modules").exists():
        print("    node_modules missing; running npm ci...")
        run(["npm", "ci"], cwd=frontend)
    run(["npm", "run", "build"], cwd=frontend)
    if not (frontend / "dist" / "index.html").exists():
        sys.exit("error: frontend build did not produce frontend/dist/index.html")


def collect_files() -> list[str]:
    tracked = git_out(["ls-files", "--", *RUNTIME_PATHS]).splitlines()
    dist = [
        str(p.relative_to(REPO_ROOT))
        for p in sorted((REPO_ROOT / "frontend" / "dist").rglob("*"))
        if p.is_file()
    ]
    print(
        f"==> Deploying {len(tracked)} tracked runtime files "
        f"+ {len(dist)} built frontend files"
    )
    return tracked + dist


def build_commit(files: list[str]) -> str:
    """Stage exactly `files` into an isolated index and return a fresh orphan commit."""
    env = os.environ.copy()
    with tempfile.TemporaryDirectory() as work_dir:
        env["GIT_INDEX_FILE"] = str(Path(work_dir) / "index")

        # Force-add (frontend/dist is gitignored). Stage via stdin to avoid arg limits.
        proc = subprocess.run(
            ["git", "add", "-f", "--", *files],
            cwd=REPO_ROOT,
            env=env,
            check=True,
        )
        del proc

        tree = git_out(["write-tree"], env=env).strip()
        head = "nogit"
        try:
            head = git_out(["rev-parse", "--short", "HEAD"]).strip()
        except subprocess.CalledProcessError:
            pass
        stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        message = f"Deploy {stamp} from {head}"

        commit = subprocess.run(
            ["git", "commit-tree", tree, "-m", message],
            cwd=REPO_ROOT,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        print(f"==> Built deploy commit {commit}")
        print(f"    {message}")
        return commit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="build and assemble, push with --dry-run (no changes on the remote)",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="reuse existing frontend/dist instead of running npm run build",
    )
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env")

    git_url = os.environ.get("XHOST_GIT_URL")
    if not git_url:
        sys.exit(
            "error: XHOST_GIT_URL is not set. "
            "Add it to your .env file or export it, e.g.:\n"
            "  XHOST_GIT_URL=https://git.xhostd.com/yanirmr/transcriptor.git"
        )
    token = os.environ.get("XHOST_TOKEN")
    if token:
        git_url = inject_token_into_url(git_url, token)

    git_branch = os.environ.get("XHOST_GIT_BRANCH", DEFAULT_GIT_BRANCH)

    display_url = git_url
    if token:
        parsed = urlparse(git_url)
        masked = parsed._replace(netloc=f"<token>:<token>@{parsed.hostname}")
        display_url = urlunparse(masked)
    print(f"==> Deploy target: {display_url} ({git_branch})")

    if args.skip_build:
        if not (REPO_ROOT / "frontend" / "dist" / "index.html").exists():
            sys.exit("error: --skip-build set but frontend/dist/index.html is missing")
        print("==> Skipping frontend build (--skip-build)")
    else:
        build_frontend()

    files = collect_files()
    commit = build_commit(files)

    push = ["git", "push", "--force"]
    if args.dry_run:
        push.append("--dry-run")
    push += [git_url, f"{commit}:refs/heads/{git_branch}"]

    print(
        f"==> Pushing to {git_branch} (force{', dry-run' if args.dry_run else ''})..."
    )
    run(push, cwd=REPO_ROOT)

    print(f"==> Triggering a deploy...")
    app_id = os.environ.get("XHOST_APP_ID")
    channel_id = os.environ.get("XHOST_API_CHANNEL")
    xhost_api_base = os.environ.get("XHOST_API_BASE", "api.xhostd.com")
    if token and app_id and channel_id:
        conn = http.client.HTTPSConnection(xhost_api_base)
        payload = json.dumps({"sha": "HEAD"})
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }
        conn.request(
            "POST",
            f"/apps/{app_id}/channels/{channel_id}/deploy",
            payload,
            headers,
        )
        res = conn.getresponse()
        data = res.read()
        print(data.decode("utf-8"))

    print("==> Deploy complete.")


if __name__ == "__main__":
    main()
