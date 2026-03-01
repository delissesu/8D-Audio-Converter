# infrastructure/audio/effects/reverb_effect.py
# Extracts the Pedalboard reverb from converter/effects.py.

import numpy as np
from pedalboard import Pedalboard, Reverb
from application.ports.audio_effect_port import IAudioEffect


class ReverbEffect(IAudioEffect):
    """Reverb effect using Spotify Pedalboard."""

    @property
    def effect_id(self) -> str:
        return "reverb"

    @property
    def display_name(self) -> str:
        return "Reverb"

    def apply(
        self,
        samples: np.ndarray,
        sample_rate: int,
        params: dict,
    ) -> np.ndarray:
        room_size: float = params.get("room_size", 0.4)
        wet_level: float = params.get("wet_level", 0.3)
        damping: float = params.get("damping", 0.5)

        board: Pedalboard = Pedalboard([
            Reverb(
                room_size=room_size,
                wet_level=wet_level,
                dry_level=1.0 - wet_level,
                damping=damping,
            )
        ])

        # Pedalboard expects shape (channels, num_frames) — transpose in/out
        samples_t: np.ndarray = samples.T.astype(np.float32)
        effected_t: np.ndarray = board(samples_t, sample_rate)

        return effected_t.T
