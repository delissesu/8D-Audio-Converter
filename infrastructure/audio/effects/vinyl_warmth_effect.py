# infrastructure/audio/effects/vinyl_warmth_effect.py
# New effect: Low-pass filter + soft saturation for analog warmth.

import numpy as np
from application.ports.audio_effect_port import IAudioEffect


class VinylWarmthEffect(IAudioEffect):
    """
    Vinyl Warmth: low-pass filter + soft-clip saturation.

    Simulates the character of vinyl/tape playback:
    - Low-pass filter at 8–16 kHz (controlled by 'warmth' param)
    - Soft-clip saturation that adds harmonics without hard clipping
    - Peak is guaranteed < 0.99 to prevent digital clipping
    """

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

        # ── Low-pass filter ──────────────────────────────────────
        # Map warmth (0–1) to cutoff frequency (16kHz down to 4kHz)
        cutoff_hz: float = 16000 - (warmth * 12000)
        cutoff_hz = max(2000, min(cutoff_hz, sample_rate * 0.45))

        # Simple first-order IIR low-pass (RC filter)
        rc: float = 1.0 / (2.0 * np.pi * cutoff_hz)
        dt: float = 1.0 / sample_rate
        alpha: float = dt / (rc + dt)

        for ch in range(2):
            channel = result[:, ch]
            for i in range(1, len(channel)):
                channel[i] = channel[i - 1] + alpha * (channel[i] - channel[i - 1])

        # ── Soft-clip saturation ─────────────────────────────────
        # Drive amount scales with warmth
        drive: float = 1.0 + warmth * 3.0  # 1x to 4x drive
        result *= drive

        # Tanh soft clipping — smooth compression
        result = np.tanh(result)

        # Scale back to stay below 0.99 peak
        peak: float = float(np.max(np.abs(result)))
        if peak > 0.99:
            result *= 0.99 / peak

        return result.astype(np.float32)
