# infrastructure/link/memory_link_store.py
import time
from typing import Optional, Dict, Tuple
from application.ports.link_store_port import ILinkStore

class MemoryLinkStore(ILinkStore):
    def __init__(self):
        # token -> (job_id, expires_at)
        self._links: Dict[str, Tuple[str, float]] = {}
        
    def create_link(self, token: str, job_id: str, expires_at: float) -> None:
        self._links[token] = (job_id, expires_at)
        self._cleanup()
        
    def get_job_id(self, token: str) -> Optional[str]:
        if token not in self._links:
            return None
            
        job_id, expires_at = self._links[token]
        if time.time() > expires_at:
            del self._links[token]
            return None
            
        return job_id
        
    def _cleanup(self):
        """Remove expired links"""
        now = time.time()
        expired = [t for t, (_, exp) in self._links.items() if now > exp]
        for t in expired:
            del self._links[t]
