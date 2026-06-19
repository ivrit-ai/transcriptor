"""Run the source-data import as a single background subprocess.

Spawns ``scripts/import_source_data.py`` with the appropriate CLI args, streams
its combined stdout/stderr to an on-disk log file, and tracks a single run via a
state file.  At most one import may run at a time.

**Race-condition prevention**
A POSIX exclusive advisory lock (``fcntl.flock``) is held on ``LOCK_PATH`` for
the entire duration of the check-and-spawn critical section inside
``start_import``.  Any concurrent caller that cannot acquire the lock
immediately gets ``LOCK_EX | LOCK_NB`` → ``BlockingIOError`` which is turned
into ``ImportAlreadyRunning``.  The lock file is opened (and kept open) only
for the duration of ``start_import``; it is not held while the subprocess runs,
so subsequent status/log reads are never blocked.

S3 credentials are passed to the subprocess via environment variables only --
they are never written to the state file, never logged, and never returned to
the client.

State lives under a hardcoded directory in the OS temp location and is treated
as best-effort (it may be cleaned up by the OS at any time).
"""
from __future__ import annotations

import fcntl
import json
import os
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Literal

# ── On-disk locations ─────────────────────────────────────────────────────────

WORK_DIR = Path(tempfile.gettempdir()) / "transcriptor_import"
STATE_PATH = WORK_DIR / "run.json"
LOG_PATH = WORK_DIR / "run.log"
LOCK_PATH = WORK_DIR / "run.lock"

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_SCRIPT_PATH = _REPO_ROOT / "scripts" / "import_source_data.py"

ImportMode = Literal["local-folder", "default-s3", "custom-s3"]


# ── Errors ──────────────────────────────────────────────────────────────────

class ImportError_(Exception):
    """Raised when an import request cannot be fulfilled."""


class ImportAlreadyRunning(ImportError_):
    pass


class ImportConfigError(ImportError_):
    pass


# ── Status model ──────────────────────────────────────────────────────────────

class RunStatus(str, Enum):
    idle = "idle"
    running = "running"
    completed = "completed"
    failed = "failed"


@dataclass
class RunState:
    status: RunStatus
    mode: ImportMode | None = None
    source: str | None = None
    license: str | None = None
    data_path: str | None = None  # local path or s3://bucket/prefix (no creds)
    clear_existing: bool = False
    pid: int | None = None
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None

    def to_public_dict(self) -> dict:
        """Serializable view safe to return to the client (no secrets)."""
        return {
            "status": self.status.value,
            "mode": self.mode,
            "source": self.source,
            "license": self.license,
            "data_path": self.data_path,
            "clear_existing": self.clear_existing,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "exit_code": self.exit_code,
        }


# ── Default-s3 availability ─────────────────────────────────────────────────

_DEFAULT_S3_ENV = (
    "IMPORT_AWS_ACCESS_KEY_ID",
    "IMPORT_AWS_SECRET_ACCESS_KEY",
    "IMPORT_AWS_REGION",
    "IMPORT_BUCKET_NAME",
)


def default_s3_available() -> bool:
    """True when all IMPORT_* env vars for default-s3 are present and non-empty."""
    return all(os.environ.get(k) for k in _DEFAULT_S3_ENV)


# ── State persistence ─────────────────────────────────────────────────────────

def _ensure_work_dir() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)


def _read_state() -> RunState | None:
    try:
        raw = json.loads(STATE_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return RunState(
        status=RunStatus(raw.get("status", "idle")),
        mode=raw.get("mode"),
        source=raw.get("source"),
        license=raw.get("license"),
        data_path=raw.get("data_path"),
        clear_existing=raw.get("clear_existing", False),
        pid=raw.get("pid"),
        started_at=raw.get("started_at"),
        finished_at=raw.get("finished_at"),
        exit_code=raw.get("exit_code"),
    )


def _write_state(state: RunState) -> None:
    _ensure_work_dir()
    payload = {
        "status": state.status.value,
        "mode": state.mode,
        "source": state.source,
        "license": state.license,
        "data_path": state.data_path,
        "clear_existing": state.clear_existing,
        "pid": state.pid,
        "started_at": state.started_at,
        "finished_at": state.finished_at,
        "exit_code": state.exit_code,
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2))


def _pid_alive(pid: int | None) -> bool:
    """Return True only if *pid* refers to a live (non-zombie) process."""
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False  # no such process

    # os.kill(pid, 0) succeeds for zombie processes too — they hold a PID slot
    # until reaped but are no longer running.  Detect zombies via:
    #   Linux: /proc/<pid>/stat field 3 == 'Z'
    #   macOS/BSD: `ps -p <pid> -o stat=` outputs a string starting with 'Z'
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        if stat.split()[2] == "Z":
            return False
    except (FileNotFoundError, IndexError):
        # /proc not available (macOS) — use ps instead
        try:
            result = subprocess.run(
                ["ps", "-p", str(pid), "-o", "stat="],
                capture_output=True, text=True, timeout=2,
            )
            if result.stdout.strip().startswith("Z"):
                return False
        except Exception:
            pass  # ps unavailable — assume alive, _reconcile will catch it later
    return True


def _reconcile(state: RunState) -> RunState:
    """Update a persisted 'running' state if its process has since exited."""
    if state.status is not RunStatus.running:
        return state
    if _pid_alive(state.pid):
        return state

    # Process is gone but state still says running: mark finished best-effort.
    # exit_code=0 → completed; anything else (including None = unknown) → failed.
    state.status = RunStatus.completed if state.exit_code == 0 else RunStatus.failed
    if state.finished_at is None:
        state.finished_at = datetime.now(UTC).isoformat()
    _write_state(state)
    return state


# ── Process watcher ──────────────────────────────────────────────────────────

def _watch_process(proc: subprocess.Popen, state: RunState) -> None:
    """Wait for *proc* to exit and write its final status to the state file.

    Runs in a daemon thread so it never blocks the FastAPI worker.  The state
    file is the source of truth; if the file has already been updated (e.g. by
    a server restart reading a stale run), this is a no-op write that keeps it
    consistent.
    """
    exit_code = proc.wait()  # blocks until the subprocess (uv) exits
    final_state = RunState(
        status=RunStatus.completed if exit_code == 0 else RunStatus.failed,
        mode=state.mode,
        source=state.source,
        license=state.license,
        data_path=state.data_path,
        clear_existing=state.clear_existing,
        pid=state.pid,
        started_at=state.started_at,
        finished_at=datetime.now(UTC).isoformat(),
        exit_code=exit_code,
    )
    _write_state(final_state)


# ── Public API ────────────────────────────────────────────────────────────────

def get_status() -> RunState:
    state = _read_state()
    if state is None:
        return RunState(status=RunStatus.idle)
    return _reconcile(state)


def get_logs(tail: int | None = None) -> str:
    try:
        text = LOG_PATH.read_text()
    except FileNotFoundError:
        return ""
    if tail is not None and tail > 0:
        lines = text.splitlines()
        text = "\n".join(lines[-tail:])
    return text


def _build_invocation(
    *,
    mode: ImportMode,
    source: str,
    license_: str,
    data_path: str | None,
    s3_key: str | None,
    s3_secret: str | None,
    s3_region: str | None,
    clear_existing: bool,
) -> tuple[list[str], dict[str, str], str]:
    """Return (argv, extra_env, public_data_path).

    Credentials go into ``extra_env`` (never into argv or the state file).
    """
    extra_env: dict[str, str] = {}

    if mode == "local-folder":
        if not data_path:
            raise ImportConfigError("data_path is required for local-folder import")
        resolved = data_path

    elif mode == "default-s3":
        if not default_s3_available():
            raise ImportConfigError(
                "default-s3 is not available: server is missing one or more of "
                "IMPORT_AWS_ACCESS_KEY_ID, IMPORT_AWS_SECRET_ACCESS_KEY, "
                "IMPORT_AWS_REGION, IMPORT_BUCKET_NAME"
            )
        bucket = os.environ["IMPORT_BUCKET_NAME"]
        prefix = (data_path or "").strip().lstrip("/")
        resolved = f"s3://{bucket}/{prefix}" if prefix else f"s3://{bucket}/"
        extra_env["IMPORT_AWS_ACCESS_KEY_ID"] = os.environ["IMPORT_AWS_ACCESS_KEY_ID"]
        extra_env["IMPORT_AWS_SECRET_ACCESS_KEY"] = os.environ["IMPORT_AWS_SECRET_ACCESS_KEY"]
        extra_env["IMPORT_AWS_REGION"] = os.environ["IMPORT_AWS_REGION"]

    elif mode == "custom-s3":
        if not all([s3_key, s3_secret, s3_region]):
            raise ImportConfigError(
                "custom-s3 requires s3_key, s3_secret, and s3_region"
            )
        if not data_path or not data_path.startswith("s3://"):
            raise ImportConfigError("custom-s3 requires an s3:// data_path")
        resolved = data_path
        extra_env["IMPORT_AWS_ACCESS_KEY_ID"] = s3_key  # type: ignore[assignment]
        extra_env["IMPORT_AWS_SECRET_ACCESS_KEY"] = s3_secret  # type: ignore[assignment]
        extra_env["IMPORT_AWS_REGION"] = s3_region  # type: ignore[assignment]

    else:  # pragma: no cover - guarded by type
        raise ImportConfigError(f"unknown import mode: {mode}")

    # Run via `uv run` so the subprocess gets the project's managed environment.
    argv = [
        "uv",
        "run",
        "python",
        str(_SCRIPT_PATH),
        resolved,
        "--source",
        source,
        "--license",
        license_,
    ]
    if clear_existing:
        argv.append("--clear-existing")

    return argv, extra_env, resolved


def start_import(
    *,
    mode: ImportMode,
    source: str,
    license_: str,
    data_path: str | None = None,
    s3_key: str | None = None,
    s3_secret: str | None = None,
    s3_region: str | None = None,
    clear_existing: bool = False,
) -> RunState:
    """Spawn the import subprocess.

    Uses an exclusive advisory flock on ``LOCK_PATH`` for the entire
    check-and-spawn critical section so that two simultaneous callers cannot
    both pass the "is it already running?" gate and each spawn a subprocess.

    Raises:
        ImportAlreadyRunning: if another import is active or the lock is held.
        ImportConfigError: if the supplied parameters are invalid.
    """
    _ensure_work_dir()

    # Validate / build argv before touching the lock so we fail fast on bad
    # input without ever acquiring it.
    argv, extra_env, public_path = _build_invocation(
        mode=mode,
        source=source,
        license_=license_,
        data_path=data_path,
        s3_key=s3_key,
        s3_secret=s3_secret,
        s3_region=s3_region,
        clear_existing=clear_existing,
    )

    # --- critical section: exclusively locked ---
    # Open (or create) the lock file.  We do NOT use LOCK_NB so that a caller
    # blocked behind a concurrent spawn waits at most until _write_state
    # finishes (~ms), then re-reads state and discovers it is running.
    # We use LOCK_NB so that a caller doesn't wait but immediately gets 409.
    lock_fd = open(LOCK_PATH, "w")
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ImportAlreadyRunning(
                "An import is already running (lock held)"
            ) from None

        # Re-check state *inside* the lock to handle the case where the
        # previous holder just spawned a process but we didn't see it yet.
        current = _read_state()
        if current is not None:
            current = _reconcile(current)
            if current.status is RunStatus.running:
                raise ImportAlreadyRunning("An import is already running")

        # Fresh log per run.
        log_file = open(LOG_PATH, "w")

        env = {**os.environ, **extra_env}
        # Subprocess inherits cwd = repo root so script-relative paths resolve.
        proc = subprocess.Popen(
            argv,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=str(_REPO_ROOT),
            env=env,
            start_new_session=True,  # detach from our process group
        )
        # log_file fd is now owned by the child; we can close our copy.
        log_file.close()

        state = RunState(
            status=RunStatus.running,
            mode=mode,
            source=source,
            license=license_,
            data_path=public_path,
            clear_existing=clear_existing,
            pid=proc.pid,
            started_at=datetime.now(UTC).isoformat(),
        )
        _write_state(state)

        # Start a daemon thread to wait() on the process and write the final
        # status+exit_code to run.json when it finishes.  Daemon=True so it
        # doesn't prevent the server from shutting down.
        watcher = threading.Thread(
            target=_watch_process, args=(proc, state), daemon=True
        )
        watcher.start()

        return state

    finally:
        # Release the lock and close the fd.  The lock is only needed during
        # check-and-spawn; the subprocess runs freely afterwards.
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()
