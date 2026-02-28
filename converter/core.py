import os
import tempfile

import numpy as np
import soundfile as sf
from pydub import AudioSegment
from tqdm import tqdm

from converter.effects import apply_panning, apply_reverb, normalize_audio
from converter.utils import validate_input_file, validate_output_path, validate_param_range


def convert_to_8d(
    input_path: str,
    output_path: str,
    pan_speed: float = 0.15,
    pan_depth: float = 1.0,
    room_size: float = 0.4,
    wet_level: float = 0.3,
    damping: float = 0.5,
    verbose: bool = True,
) -> None:
    """
    Full pipeline: load audio → pan → reverb → normalize → save.

    Args:
        input_path:  Source audio file (mp3/wav/flac/ogg)
        output_path: Destination WAV file path
        pan_speed:   Panning oscillation speed in Hz (0.05–1.0)
        pan_depth:   Panning intensity (0.0–1.0)
        room_size:   Reverb room size (0.0–1.0)
        wet_level:   Reverb wet mix (0.0–1.0)
        damping:     Reverb damping (0.0–1.0)
        verbose:     Print progress steps if True
    """
    # Validation
    validate_input_file(input_path)
    validate_output_path(output_path)
    validate_param_range(pan_speed, "pan_speed", 0.01, 2.0)
    validate_param_range(pan_depth, "pan_depth", 0.0, 1.0)
    validate_param_range(room_size, "room_size", 0.0, 1.0)
    validate_param_range(wet_level, "wet_level", 0.0, 1.0)
    validate_param_range(damping,   "damping",   0.0, 1.0)

    steps : list[str] = [
        "Loading audio file",
        "Applying auto-panning",
        "Applying reverb",
        "Normalizing audio",
        "Saving output",
    ]

    with tqdm(total=len(steps), desc="Processing", unit="step",
              disable=not verbose) as pbar:

        # Step 1: Load audio
        pbar.set_description(steps[0])
        audio_segment : AudioSegment = AudioSegment.from_file(input_path)
        audio_segment = audio_segment.set_channels(2)  # Force stereo

        # Export to a temp WAV so soundfile can read it as numpy
        tmp_fd : int
        tmp_path : str
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        os.close(tmp_fd)
        try:
            audio_segment.export(tmp_path, format="wav")
            samples : np.ndarray
            sr : int
            samples, sr = sf.read(tmp_path, dtype="float32")
        finally:
            os.unlink(tmp_path)

        # Ensure shape is (num_frames, 2)
        if samples.ndim == 1:
            samples = np.column_stack([samples, samples])
        pbar.update(1)

        # Step 2: Auto-panning
        pbar.set_description(steps[1])
        samples = apply_panning(samples, sr, pan_speed, pan_depth)
        pbar.update(1)

        # Step 3: Reverb
        pbar.set_description(steps[2])
        samples = apply_reverb(samples, sr, room_size, wet_level, damping)
        pbar.update(1)

        # Step 4: Normalize
        pbar.set_description(steps[3])
        samples = normalize_audio(samples)
        pbar.update(1)

        # Step 5: Save
        pbar.set_description(steps[4])
        sf.write(output_path, samples, sr, subtype="PCM_16")
        pbar.update(1)

    if verbose:
        size_mb : float = os.path.getsize(output_path) / (1024 * 1024)
        print(f"\n✅ Saved to: {output_path} ({size_mb:.2f} MB)")
