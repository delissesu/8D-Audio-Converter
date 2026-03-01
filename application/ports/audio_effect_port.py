# application/ports/audio_effect_port.py
# Port interface for pluggable audio effects in the DSP chain.
# Domain layer — must not import infrastructure or adapter code.

from abc import ABC, abstractmethod
import numpy as np


class IAudioEffect(ABC):
    """Abstract base class for all audio effects in the processing chain."""

    @property
    @abstractmethod
    def effect_id(self) -> str:
        """Unique identifier for this effect (e.g., '8d_rotate', 'reverb')."""
        ...

    @property
    def display_name(self) -> str:
        """Human-readable name for the effect."""
        return self.effect_id

    @abstractmethod
    def apply(
        self,
        samples: np.ndarray,    # shape: (N, 2) float32 stereo
        sample_rate: int,
        params: dict,
    ) -> np.ndarray:
        """
        Apply this effect to the audio samples.

        Args:
            samples:     Stereo audio as (num_frames, 2) float32 array.
            sample_rate: Sample rate in Hz.
            params:      Effect parameters dict.

        Returns:
            Processed audio as (num_frames, 2) float32 array.
        """
        ...
