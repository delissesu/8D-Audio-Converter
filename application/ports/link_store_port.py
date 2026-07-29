
from abc import ABC, abstractmethod
from typing import Optional

class ILinkStore(ABC):
    @abstractmethod
    def create_link(self, token: str, job_id: str, expires_at: float) -> None:

        pass
        
    @abstractmethod
    def get_job_id(self, token: str) -> Optional[str]:

        pass
