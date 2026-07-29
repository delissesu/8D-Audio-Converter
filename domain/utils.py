import os

SUPPORTED_INPUT_FORMATS: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a"}
SUPPORTED_OUTPUT_FORMATS: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}

FORMAT_EXPORT_MAP: dict[str, str] = {
    ".mp3": "mp3",
    ".wav": "wav",
    ".flac": "flac",
    ".ogg": "ogg",
    ".m4a": "mp4",
}

DEFAULT_PARAMS: dict[str, float] = {
    "speed": 0.15,
    "depth": 1.0,
    "room": 0.4,
    "wet": 0.3,
    "damping": 0.5,
}

def validate_input_file(path: str) -> None:

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Input file not found: '{path}'.\n" f"    → Check the path and try again."
        )
    if not os.path.isfile(path):
        raise ValueError(
            f"Input path is not a file: '{path}'.\n"
            f"    → Provide a path to an audio file, not a directory."
        )

    ext: str = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_INPUT_FORMATS:
        raise ValueError(
            f"Unsupported input format: '{ext}'.\n"
            f"    Supported: {', '.join(sorted(SUPPORTED_INPUT_FORMATS))}\n"
            f"    → Example: python main.py song.mp3 song_8d.wav"
        )

def validate_output_path(path: str) -> None:

    ext: str = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_OUTPUT_FORMATS:
        raise ValueError(
            f"Unsupported output format: '{ext}'.\n"
            f"    Supported: {', '.join(sorted(SUPPORTED_OUTPUT_FORMATS))}\n"
            f"    → Example: python main.py song.mp3 song_8d.mp3"
        )

    output_dir: str = os.path.dirname(os.path.abspath(path))
    if not os.path.exists(output_dir):
        raise FileNotFoundError(
            f"Output directory does not exist: '{output_dir}'.\n"
            f"    → Create the directory first, or choose an existing path."
        )

def validate_param_range(
    value: float, name: str, min_val: float, max_val: float
) -> None:

    if not (min_val <= value <= max_val):
        raise ValueError(
            f"Parameter '{name}' must be between {min_val} and {max_val}. Got: {value}.\n"
            f"    → Adjust the value to be within the valid range."
        )

def get_output_path(
    input_path: str, suffix: str = "_8d", output_ext: str = ".wav"
) -> str:

    base: str
    base, _ = os.path.splitext(input_path)
    return f"{base}{suffix}{output_ext}"

def get_export_format(path: str) -> str:

    ext: str = os.path.splitext(path)[1].lower()
    return FORMAT_EXPORT_MAP.get(ext, "wav")
