

import time
import secrets
from threading import Lock
from typing import Optional, Dict

from application.ports.link_store_port import ILinkStore

class MemoryLinkStore(ILinkStore):
    def __init__(self) -> None:
        self._store: Dict[str, dict] = {}
        self._lock: Lock = Lock()

    def create(self, job_id: str, ttl_seconds: int = 86400) -> str:

        token = secrets.token_urlsafe(16)
        with self._lock:
            self._store[token] = {
                "job_id": job_id,
                "expires_at": time.time() + ttl_seconds,
            }
            self._cleanup_unlocked()
        return token

    def resolve(self, token: str) -> Optional[str]:

        with self._lock:
            entry = self._store.get(token)
            if entry is None:
                return None
            if time.time() > entry["expires_at"]:
                del self._store[token]
                return None
            return entry["job_id"]

    def revoke(self, token: str) -> None:

        with self._lock:
            self._store.pop(token, None)

    def create_link(self, token: str, job_id: str, expires_at: float) -> None:
        with self._lock:
            self._store[token] = {
                "job_id": job_id,
                "expires_at": expires_at,
            }
            self._cleanup_unlocked()

    def get_job_id(self, token: str) -> Optional[str]:
        return self.resolve(token)

    def _cleanup_unlocked(self) -> None:

        now = time.time()
        expired = [t for t, e in self._store.items() if now > e["expires_at"]]
        for t in expired:
            del self._store[t]
