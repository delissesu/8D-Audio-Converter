

from abc import ABC, abstractmethod
import numpy as np

class IAudioTrimmer(ABC):

    @abstractmethod
    def trim(
        self,
        samples: np.ndarray,
        sample_rate: int,
        start_sec: float,
        end_sec: float,
    ) -> np.ndarray:

        ...
