# application/ports/audio_trimmer_port.py
# Port interface for audio trimming.

from abc import ABC, abstractmethod
import numpy as np


class IAudioTrimmer(ABC):
    """Abstract base class for audio trimming."""

    @abstractmethod
    def trim(
        self,
        samples: np.ndarray,
        sample_rate: int,
        start_sec: float,
        end_sec: float,
    ) -> np.ndarray:
        """
        Trim audio samples to the specified time range.

        Args:
            samples:     Audio as (num_frames, channels) float32 array.
            sample_rate: Sample rate in Hz.
            start_sec:   Start time in seconds.
            end_sec:     End time in seconds (0 = end of file).

        Returns:
            Trimmed audio array.
        """
        ...
