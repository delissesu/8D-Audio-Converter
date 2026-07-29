import os

import tempfile

from pathlib import Path

from domain.utils import DEFAULT_PARAMS

from infrastructure.web.file_security import (
    ALLOWED_OUTPUT_FORMATS,
    MAX_UPLOAD_BYTES,
    safe_float,
    sanitize_filename,
    validate_magic_bytes,
)

def parse_output_format(form, default: str) -> tuple[str | None, str | None]:

    out_format = form.get("format", default).lower().strip().lstrip(".")

    if out_format not in ALLOWED_OUTPUT_FORMATS:

        return None, f"Format '{out_format}' is not allowed."

    return out_format, None

def parse_conversion_params(form, include_trim: bool = False) -> dict:

    params = {
        "speed": safe_float(form.get("speed"), DEFAULT_PARAMS["speed"], 0.01, 2.0),
        "depth": safe_float(form.get("depth"), DEFAULT_PARAMS["depth"], 0.0, 1.0),
        "room": safe_float(form.get("room"), DEFAULT_PARAMS["room"], 0.0, 1.0),
        "wet": safe_float(form.get("wet"), DEFAULT_PARAMS["wet"], 0.0, 1.0),
        "damping": safe_float(form.get("damping"), DEFAULT_PARAMS["damping"], 0.0, 1.0),
    }

    if include_trim:

        params["trim_start"] = safe_float(form.get("trim_start"), 0.0, 0.0, 3600.0)

        params["trim_end"] = safe_float(form.get("trim_end"), 0.0, 0.0, 3600.0)

    return params

def parse_effect_ids(form) -> list[str]:

    effect_ids = form.getlist("effects[]")

    if not effect_ids:

        effect_ids = form.getlist("effects")

    return effect_ids

def save_valid_upload(audio_file) -> tuple[str | None, str | None, str | None, int]:

    header = audio_file.read(16)

    audio_file.seek(0)

    if not validate_magic_bytes(header):

        return None, None, "Unsupported or invalid audio file.", 0

    safe_name = sanitize_filename(audio_file.filename or "upload.mp3")

    suffix = Path(safe_name).suffix or ".mp3"

    tmp_fd_in, tmp_in = tempfile.mkstemp(suffix=suffix)

    os.close(tmp_fd_in)

    try:

        audio_file.save(tmp_in)

    except Exception:

        if os.path.exists(tmp_in):

            os.unlink(tmp_in)

        raise

    actual_size = os.path.getsize(tmp_in)

    if actual_size > MAX_UPLOAD_BYTES:

        os.unlink(tmp_in)

        return None, safe_name, "File too large after save.", actual_size

    if actual_size == 0:

        os.unlink(tmp_in)

        return None, safe_name, "Empty file uploaded.", actual_size

    return tmp_in, safe_name, None, actual_size
