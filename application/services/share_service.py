import os

from datetime import datetime, timedelta

from infrastructure.link.memory_link_store import MemoryLinkStore

from infrastructure.web.job_store import get_job

_link_store = MemoryLinkStore()

def get_share_ttl() -> int:

    try:

        return int(os.environ.get("SHARE_LINK_TTL_SECONDS", "86400"))

    except (ValueError, TypeError):

        return 86400

def create_share_token(job_id: str) -> dict:

    job = get_job(job_id)

    if job is None:

        return {"error": "Job not found.", "status_code": 404}

    if job.get("status") != "done":

        return {
            "error": f"Job is not ready. Current status: {job.get('status', 'unknown')}",
            "status_code": 404,
        }

    ttl = get_share_ttl()

    token = _link_store.create(job_id, ttl_seconds=ttl)

    expires_at = (datetime.utcnow() + timedelta(seconds=ttl)).isoformat() + "Z"

    return {"token": token, "expires_at": expires_at, "status_code": 201}

def resolve_share_token(token: str) -> str | None:

    return _link_store.resolve(token)
