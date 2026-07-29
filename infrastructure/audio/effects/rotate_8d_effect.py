

import numpy as np
from application.ports.audio_effect_port import IAudioEffect

class Rotate8DEffect(IAudioEffect):

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

        raw_pan: np.ndarray = np.sin(2 * np.pi * pan_speed * t) * pan_depth

        pan_position: np.ndarray = (raw_pan + 1.0) / 2.0

        angle: np.ndarray = pan_position * (np.pi / 2.0)
        left_gain: np.ndarray = np.cos(angle)
        right_gain: np.ndarray = np.sin(angle)

        panned: np.ndarray = samples.copy()
        panned[:, 0] *= left_gain
        panned[:, 1] *= right_gain

        return panned
