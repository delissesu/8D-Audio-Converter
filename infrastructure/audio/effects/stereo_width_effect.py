

import numpy as np
from application.ports.audio_effect_port import IAudioEffect

class StereoWidthEffect(IAudioEffect):

    @property
    def effect_id(self) -> str:
        return "stereo_width"

    @property
    def display_name(self) -> str:
        return "Stereo Width"

    def apply(
        self,
        samples: np.ndarray,
        sample_rate: int,
        params: dict,
    ) -> np.ndarray:
        width: float = params.get("stereo_width", 0.5)

        if width <= 0.01:
            return samples

        delay_ms: float = width * 20.0
        delay_samples: int = int(sample_rate * delay_ms / 1000.0)

        if delay_samples <= 0:
            return samples

        result: np.ndarray = samples.copy()

        right_delayed = np.zeros_like(result[:, 1])
        right_delayed[delay_samples:] = result[:-delay_samples, 1]
        right_delayed[:delay_samples] = result[:delay_samples, 1]
        result[:, 1] = right_delayed

        return result
