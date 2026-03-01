# infrastructure/audio/effects/rotate_8d_effect.py
# Extracts the sinusoidal stereo auto-panning from converter/effects.py.

import numpy as np
from application.ports.audio_effect_port import IAudioEffect


class Rotate8DEffect(IAudioEffect):
    """Sinusoidal stereo auto-panning — the core '8D' spatial effect."""

    @property
    def effect_id(self) -> str:
        return "8d_rotate"

    @property
    def display_name(self) -> str:
        return "8D Rotation"

    def apply(
        self,
        samples: np.ndarray,
        sample_rate: int,
        params: dict,
    ) -> np.ndarray:
        pan_speed: float = params.get("pan_speed", 0.15)
        pan_depth: float = params.get("pan_depth", 1.0)

        num_frames: int = len(samples)
        t: np.ndarray = np.linspace(
            0, num_frames / sample_rate, num_frames, dtype=np.float32
        )

        # Sine oscillator: output range [-1, 1]
        raw_pan: np.ndarray = np.sin(2 * np.pi * pan_speed * t) * pan_depth

        # Map to [0.0, 1.0] pan position (0=full left, 1=full right)
        pan_position: np.ndarray = (raw_pan + 1.0) / 2.0

        # Constant-power panning law: prevents loudness dip at center
        angle: np.ndarray = pan_position * (np.pi / 2.0)
        left_gain: np.ndarray = np.cos(angle)
        right_gain: np.ndarray = np.sin(angle)

        panned: np.ndarray = samples.copy()
        panned[:, 0] *= left_gain
        panned[:, 1] *= right_gain

        return panned
