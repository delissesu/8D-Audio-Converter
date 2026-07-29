import os

import re

import tempfile

import uuid

from pathlib import Path

AUDIO_MAGIC_BYTES: dict[bytes, str] = {
    b"\xff\xfb": ".mp3",
    b"\xff\xf3": ".mp3",
    b"\xff\xf2": ".mp3",
    b"ID3": ".mp3",
    b"RIFF": ".wav",
    b"fLaC": ".flac",
    b"OggS": ".ogg",
    b"\x00\x00\x00\x20ftyp": ".m4a",
    b"\x00\x00\x00\x1cftyp": ".m4a",
}

ALLOWED_OUTPUT_FORMATS: frozenset[str] = frozenset({"mp3", "wav", "flac", "ogg", "m4a"})

MAX_UPLOAD_BYTES: int = 100 * 1024 * 1024

SAFE_TEMP_DIR: str = os.path.realpath(tempfile.gettempdir())

def validate_magic_bytes(file_bytes: bytes) -> bool:

    for magic in AUDIO_MAGIC_BYTES:

        if file_bytes[:len(magic)] == magic:

            return True

    return False

def sanitize_filename(name: str) -> str:

    safe_name = Path(name).name

    safe_name = re.sub(r"[^\w\s\-.]", "", safe_name)

    safe_name = re.sub(r"\.{2,}", ".", safe_name)

    return safe_name[:128].strip()

def is_valid_job_id(job_id: str) -> bool:

    try:

        value = uuid.UUID(job_id, version=4)

        return str(value) == job_id

    except ValueError:

        return False

def is_safe_path(path: str) -> bool:

    resolved = os.path.realpath(path)

    return resolved.startswith(SAFE_TEMP_DIR + os.sep)

def safe_float(value, default: float, min_v: float, max_v: float) -> float:

    try:

        parsed = float(value)

    except (TypeError, ValueError):

        return default

    return max(min_v, min(max_v, parsed))

def get_audio_mimetype(extension: str) -> str:

    return {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "aac": "audio/aac",
        "m4a": "audio/mp4",
        "aiff": "audio/aiff",
    }.get(extension, "application/octet-stream")
