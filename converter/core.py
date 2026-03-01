import os
import tempfile
import time
from typing import Optional, Callable

import numpy as np
import soundfile as sf
from pydub import AudioSegment

from converter.effects import apply_panning, apply_reverb, normalize_audio
from converter.utils import (
    validate_input_file,
    validate_output_path,
    validate_param_range,
    get_export_format,
)


def convert_to_8d(
    input_path  : str,
    output_path : str,
    pan_speed   : float = 0.15,
    pan_depth   : float = 1.0,
    room_size   : float = 0.4,
    wet_level   : float = 0.3,
    damping     : float = 0.5,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> None:
    """
    Full pipeline: load audio → pan → reverb → normalize → save.

    Args:
        input_path:  Source audio file (mp3/wav/flac/ogg/aac/m4a).
        output_path: Destination audio file (.wav/.mp3/.flac/.ogg/.m4a).
        pan_speed:   Panning oscillation speed in Hz (0.01–2.0).
        pan_depth:   Panning intensity (0.0–1.0).
        room_size:   Reverb room size (0.0–1.0).
        wet_level:   Reverb wet mix (0.0–1.0).
        damping:     Reverb damping (0.0–1.0).
        progress_callback: Optional callback (step_idx, total_steps, step_name).
    """
    # ── Validate inputs ──────────────────────────────────────────
    validate_input_file(input_path)
    validate_output_path(output_path)
    validate_param_range(pan_speed, "pan_speed", 0.01, 2.0)
    validate_param_range(pan_depth, "pan_depth", 0.0, 1.0)
    validate_param_range(room_size, "room_size", 0.0, 1.0)
    validate_param_range(wet_level, "wet_level", 0.0, 1.0)
    validate_param_range(damping,   "damping",   0.0, 1.0)

    # HIG: Clarity — step labels use present-tense action verbs
    steps : list[str] = [
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

    start_time : float = time.time()

    # [1/5] Load audio
    _report(0)
    audio_segment : AudioSegment = AudioSegment.from_file(input_path)

    # P2: Audio duration cap — prevent decompression bombs
    duration_sec = len(audio_segment) / 1000.0
    if duration_sec > 600:   # 10 minutes
        raise ValueError(
            f"Audio too long: {duration_sec:.0f}s (max 600s / 10 min).\n"
            f"    → Use a shorter audio file."
        )

    audio_segment = audio_segment.set_channels(2)  # Force stereo

    # Export to a temp WAV so soundfile can read it as numpy
    tmp_fd   : int
    tmp_path : str
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(tmp_fd)
    try:
        audio_segment.export(tmp_path, format="wav")
        samples : np.ndarray
        sr      : int
        samples, sr = sf.read(tmp_path, dtype="float32")
    finally:
        os.unlink(tmp_path)

    # Ensure shape is (num_frames, 2)
    if samples.ndim == 1:
        samples = np.column_stack([samples, samples])

    # [2/5] Auto-panning
    _report(1)
    samples = apply_panning(samples, sr, pan_speed, pan_depth)

    # [3/5] Reverb
    _report(2)
    samples = apply_reverb(samples, sr, room_size, wet_level, damping)

    # [4/5] Normalize
    _report(3)
    samples = normalize_audio(samples)

    # [5/5] Export to target format
    _report(4)
    export_fmt : str = get_export_format(output_path)

    if export_fmt == "wav":
        # Direct WAV write — fastest path, no FFmpeg needed
        sf.write(output_path, samples, sr, subtype="PCM_16")
    else:
        # Write temp WAV → convert to target format via pydub + FFmpeg
        tmp_out : str = tempfile.mktemp(suffix=".wav")
        try:
            sf.write(tmp_out, samples, sr, subtype="PCM_16")
            audio_out : AudioSegment = AudioSegment.from_wav(tmp_out)
            audio_out.export(output_path, format=export_fmt)
        finally:
            if os.path.exists(tmp_out):
                os.remove(tmp_out)
