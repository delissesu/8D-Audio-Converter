# infrastructure/web/job_store.py
# Centralized in-memory job store — single source of truth.
# All controllers (audio, share, batch) MUST import from here.
# Thread-safe: all mutations are guarded by a Lock.

from threading import Lock
from typing import Optional

_jobs: dict = {}
_lock: Lock = Lock()


def get_job(job_id: str) -> Optional[dict]:
    """Return job dict or None."""
    with _lock:
        return _jobs.get(job_id)


def set_job(job_id: str, data: dict) -> None:
    """Create or overwrite a job entry."""
    with _lock:
        _jobs[job_id] = data


def update_job(job_id: str, updates: dict) -> None:
    """Merge *updates* into an existing job dict."""
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(updates)


def delete_job(job_id: str) -> None:
    """Remove a job entry (no-op if missing)."""
    with _lock:
        _jobs.pop(job_id, None)


def all_jobs() -> dict:
    """Return a shallow copy of the entire store (for diagnostics)."""
    with _lock:
        return dict(_jobs)
