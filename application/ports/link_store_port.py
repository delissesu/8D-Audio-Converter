# application/ports/link_store_port.py
from abc import ABC, abstractmethod
from typing import Optional

class ILinkStore(ABC):
    @abstractmethod
    def create_link(self, token: str, job_id: str, expires_at: float) -> None:
        """Store a new share link mapping a token to a job_id with an expiration timestamp."""
        pass
        
    @abstractmethod
    def get_job_id(self, token: str) -> Optional[str]:
        """Retrieve the job_id for a token if it exists and hasn't expired."""
        pass
