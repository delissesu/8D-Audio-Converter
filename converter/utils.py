import os

# Supported Formats
SUPPORTED_INPUT_FORMATS : set[str] = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a"}
SUPPORTED_OUTPUT_FORMATS : set[str] = {".wav"}


def validate_input_file(path: str) -> None:
    """Raise ValueError with a clear message if the input path is invalid."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Input file not found: '{path}'")
    if not os.path.isfile(path):
        raise ValueError(f"Input path is not a file: '{path}'")

    ext : str = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_INPUT_FORMATS:
        raise ValueError(
            f"Unsupported input format: '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_INPUT_FORMATS))}"
        )


def validate_output_path(path: str) -> None:
    """Raise ValueError if output path has an unsupported extension."""
    ext : str = os.path.splitext(path)[1].lower()
    if ext not in SUPPORTED_OUTPUT_FORMATS:
        raise ValueError(
            f"Output must be a .wav file. Got: '{ext}'"
        )

    output_dir : str = os.path.dirname(os.path.abspath(path))
    if not os.path.exists(output_dir):
        raise FileNotFoundError(
            f"Output directory does not exist: '{output_dir}'"
        )


def validate_param_range(value: float, name: str, min_val: float, max_val: float) -> None:
    """Raise ValueError if a float parameter is out of its valid range."""
    if not (min_val <= value <= max_val):
        raise ValueError(
            f"Parameter '{name}' must be between {min_val} and {max_val}. Got: {value}"
        )


def get_output_path(input_path: str, suffix: str = "_8d") -> str:
    """
    Auto-generate an output path from an input path.
    Example: song.mp3 -> song_8d.wav
    """
    base : str
    base, _ = os.path.splitext(input_path)
    return f"{base}{suffix}.wav"
