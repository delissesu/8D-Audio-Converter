import os
import tempfile
import time
from typing import Optional, Callable, List

import numpy as np
import soundfile as sf
from pydub import AudioSegment

from domain.utils import (
    validate_input_file,
    validate_output_path,
    validate_param_range,
    get_export_format,
)

from infrastructure.audio.effects.rotate_8d_effect import Rotate8DEffect
from infrastructure.audio.effects.reverb_effect import ReverbEffect


def _normalize_audio(samples: np.ndarray) -> np.ndarray:
    peak = float(np.max(np.abs(samples)))
    if peak > 0:
        return (samples / peak) * 0.99
    return samples

def convert_to_8d(
    input_path: str,
    output_path: str,
    pan_speed: float = 0.15,
    pan_depth: float = 1.0,
    room_size: float = 0.4,
    wet_level: float = 0.3,
    damping: float = 0.5,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    effect_chain: Optional[List] = None,
    trim_start: float = 0.0,
    trim_end: float = 0.0,
) -> None:

    validate_input_file(input_path)
    validate_output_path(output_path)
    validate_param_range(pan_speed, "pan_speed", 0.01, 2.0)
    validate_param_range(pan_depth, "pan_depth", 0.0, 1.0)
    validate_param_range(room_size, "room_size", 0.0, 1.0)
    validate_param_range(wet_level, "wet_level", 0.0, 1.0)
    validate_param_range(damping, "damping", 0.0, 1.0)

    params: dict = {
        "pan_speed": pan_speed,
        "pan_depth": pan_depth,
        "room_size": room_size,
        "wet_level": wet_level,
        "damping": damping,
    }

    use_chain: bool = effect_chain is not None and len(effect_chain) > 0

    if use_chain:
        effect_step_names = [f"Applying {e.display_name}" for e in effect_chain]
        steps = (
            ["Loading audio file"]
            + effect_step_names
            + [
                "Normalizing audio",
                "Exporting to target format",
            ]
        )
    else:
        steps = [
            "Loading audio file",
            "Applying auto-panning",
            "Applying reverb",
            "Normalizing audio",
            "Exporting to target format",
        ]

    total_steps = len(steps)

    def _report(step_idx: int) -> None:
        if progress_callback:
            progress_callback(step_idx, total_steps, steps[step_idx])

    start_time: float = time.time()

    _report(0)
    audio_segment: AudioSegment = AudioSegment.from_file(input_path)

    duration_sec = len(audio_segment) / 1000.0
    if duration_sec > 600:
        raise ValueError(
            f"Audio too long: {duration_sec:.0f}s (max 600s / 10 min).\n"
            f"    → Use a shorter audio file."
        )

    audio_segment = audio_segment.set_channels(2)

    tmp_fd: int
    tmp_path: str
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(tmp_fd)
    try:
        audio_segment.export(tmp_path, format="wav")
        samples: np.ndarray
        sr: int
        samples, sr = sf.read(tmp_path, dtype="float32")
    finally:
        os.unlink(tmp_path)

    if samples.ndim == 1:
        samples = np.column_stack([samples, samples])

    total_dur = len(samples) / sr
    t_start = max(0.0, float(trim_start) if trim_start else 0.0)
    t_end_raw = float(trim_end) if trim_end else 0.0

    t_end = t_end_raw if t_end_raw > 0 else total_dur

    selection_dur = t_end - t_start
    should_trim = (
        t_end > t_start + 0.1
        and t_start < total_dur
        and abs(selection_dur - total_dur) > 0.5
    )

    if should_trim:
        start_frame = max(0, int(t_start * sr))
        end_frame = min(len(samples), int(t_end * sr))
        if end_frame > start_frame:
            samples = samples[start_frame:end_frame]

    if use_chain:
        for i, effect in enumerate(effect_chain):
            _report(i + 1)
            samples = effect.apply(samples, sr, params)
    else:

        _report(1)
        rotate = Rotate8DEffect()
        samples = rotate.apply(samples, sr, params)

        _report(2)
        reverb = ReverbEffect()
        samples = reverb.apply(samples, sr, params)

    _report(len(steps) - 2)
    samples = _normalize_audio(samples)

    _report(len(steps) - 1)
    export_fmt: str = get_export_format(output_path)

    if export_fmt == "wav":
        sf.write(output_path, samples, sr, subtype="PCM_16")
    else:
        tmp_out: str = tempfile.mktemp(suffix=".wav")
        try:
            sf.write(tmp_out, samples, sr, subtype="PCM_16")
            audio_out: AudioSegment = AudioSegment.from_wav(tmp_out)
            audio_out.export(output_path, format=export_fmt)
        finally:
            if os.path.exists(tmp_out):
                os.remove(tmp_out)
