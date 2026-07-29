

from threading import Lock
from typing import Optional

_jobs: dict = {}
_lock: Lock = Lock()

def get_job(job_id: str) -> Optional[dict]:

    with _lock:
        return _jobs.get(job_id)

def set_job(job_id: str, data: dict) -> None:

    with _lock:
        _jobs[job_id] = data

def update_job(job_id: str, updates: dict) -> None:

    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(updates)

def delete_job(job_id: str) -> None:

    with _lock:
        _jobs.pop(job_id, None)

def all_jobs() -> dict:

    with _lock:
        return dict(_jobs)
