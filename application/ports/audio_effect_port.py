

from abc import ABC, abstractmethod
import numpy as np

class IAudioEffect(ABC):

    @property
    @abstractmethod
    def effect_id(self) -> str:

        ...

    @property
    def display_name(self) -> str:

        return self.effect_id

    @abstractmethod
    def apply(
        self,
        samples: np.ndarray,
        sample_rate: int,
        params: dict,
    ) -> np.ndarray:

        ...
