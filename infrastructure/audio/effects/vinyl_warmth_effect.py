

import numpy as np
from application.ports.audio_effect_port import IAudioEffect

class VinylWarmthEffect(IAudioEffect):

    @property
    def effect_id(self) -> str:
        return "vinyl_warmth"

    @property
    def display_name(self) -> str:
        return "Vinyl Warmth"

    def apply(
        self,
        samples: np.ndarray,
        sample_rate: int,
        params: dict,
    ) -> np.ndarray:
        warmth: float = params.get("vinyl_warmth", 0.3)

        if warmth <= 0.01:
            return samples

        result: np.ndarray = samples.copy().astype(np.float64)

        cutoff_hz: float = 16000 - (warmth * 12000)
        cutoff_hz = max(2000, min(cutoff_hz, sample_rate * 0.45))

        rc: float = 1.0 / (2.0 * np.pi * cutoff_hz)
        dt: float = 1.0 / sample_rate
        alpha: float = dt / (rc + dt)

        for ch in range(2):
            channel = result[:, ch]
            for i in range(1, len(channel)):
                channel[i] = channel[i - 1] + alpha * (channel[i] - channel[i - 1])

        drive: float = 1.0 + warmth * 3.0
        result *= drive

        result = np.tanh(result)

        peak: float = float(np.max(np.abs(result)))
        if peak > 0.99:
            result *= 0.99 / peak

        return result.astype(np.float32)
