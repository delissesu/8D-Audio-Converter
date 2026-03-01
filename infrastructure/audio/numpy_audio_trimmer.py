# infrastructure/audio/numpy_audio_trimmer.py
# Implementation of IAudioTrimmer using NumPy array slicing.

import numpy as np
from application.ports.audio_trimmer_port import IAudioTrimmer


class NumpyAudioTrimmer(IAudioTrimmer):
    """Trim audio using direct NumPy array slicing."""

    def trim(
        self,
        samples: np.ndarray,
        sample_rate: int,
        start_sec: float,
        end_sec: float,
    ) -> np.ndarray:
        total_duration = len(samples) / sample_rate

        # Normalize: 0 start means beginning, 0 end means full file
        if start_sec <= 0 and (end_sec <= 0 or end_sec >= total_duration):
            return samples  # No trim needed

        start_frame = max(0, int(start_sec * sample_rate))

        if end_sec <= 0 or end_sec >= total_duration:
            end_frame = len(samples)
        else:
            end_frame = min(len(samples), int(end_sec * sample_rate))

        # Ensure start < end
        if start_frame >= end_frame:
            return samples

        return samples[start_frame:end_frame]
