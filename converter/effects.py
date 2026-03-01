import numpy as np
from pedalboard._pedalboard import Pedalboard
from pedalboard import Reverb


def apply_panning(
    samples: np.ndarray,
    sample_rate: int,
    pan_speed: float = 0.15,
    pan_depth: float = 1.0,
) -> np.ndarray:
    """
    Apply sinusoidal stereo auto-panning to a stereo float32 numpy array.

    Args:
        samples:     Shape (num_frames, 2), dtype float32, values in [-1.0, 1.0]
        sample_rate: Audio sample rate in Hz
        pan_speed:   Rotation frequency in Hz (how fast L→R→L cycles)
        pan_depth:   Pan intensity 0.0 (center only) to 1.0 (full L→R sweep)

    Returns:
        Panned audio array, same shape and dtype as input.
    """
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
    left_gain: np.ndarray = np.cos(angle)  # shape: (num_frames,)
    right_gain: np.ndarray = np.sin(angle)  # shape: (num_frames,)

    panned: np.ndarray = samples.copy()
    panned[:, 0] *= left_gain
    panned[:, 1] *= right_gain

    return panned


def apply_reverb(
    samples: np.ndarray,
    sample_rate: int,
    room_size: float = 0.4,
    wet_level: float = 0.3,
    damping: float = 0.5,
) -> np.ndarray:
    """
    Apply reverb to a stereo float32 numpy array using Pedalboard.

    Args:
        samples:     Shape (num_frames, 2), dtype float32
        sample_rate: Audio sample rate in Hz
        room_size:   Reverb room size 0.0–1.0 (larger = longer tail)
        wet_level:   Reverb wet/effect mix 0.0–1.0
        damping:     High-frequency damping 0.0–1.0 (higher = warmer reverb)

    Returns:
        Reverb-processed audio array, same shape as input.
    """
    board: Pedalboard = Pedalboard(
        [
            Reverb(
                room_size=room_size,
                wet_level=wet_level,
                dry_level=1.0 - wet_level,
                damping=damping,
            )
        ]
    )

    # pedalboard expects shape (channels, num_frames) — transpose in/out
    samples_t: np.ndarray = samples.T.astype(np.float32)  # (2, num_frames)
    effected_t: np.ndarray = board(samples_t, sample_rate)  # (2, num_frames)

    return effected_t.T  # back to (num_frames, 2)


def normalize_audio(samples: np.ndarray) -> np.ndarray:
    """
    Peak-normalize audio to prevent clipping.
    Scales so the loudest sample equals 0.99 (leaves headroom).
    """
    peak: float = float(np.max(np.abs(samples)))
    if peak > 0:
        return (samples / peak) * 0.99
    return samples
