# infrastructure/web/zip_builder.py
# Builds ZIP archives in-memory from a list of file paths.

import io
import zipfile
import os
from pathlib import Path


def build_zip(file_entries: list[dict]) -> io.BytesIO:
    """
    Build a ZIP archive in memory from a list of file entries.

    Args:
        file_entries: list of dicts with keys:
            - "path": absolute filesystem path to the file
            - "name": desired filename in the ZIP archive

    Returns:
        io.BytesIO containing the ZIP data, seeked to position 0.
    """
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in file_entries:
            filepath = entry["path"]
            arcname = entry["name"]

            if os.path.exists(filepath):
                zf.write(filepath, arcname)

    buffer.seek(0)
    return buffer


def build_batch_zip(results: list[dict], output_format: str) -> io.BytesIO:
    """
    Build a ZIP from batch conversion results.

    Args:
        results: list of dicts with keys:
            - "filename": original filename (without extension)
            - "output_path": path to converted file
            - "status": must be "done" to include
        output_format: output format extension (e.g., "mp3")

    Returns:
        io.BytesIO containing the ZIP data.
    """
    entries = []

    for i, result in enumerate(results, start=1):
        if result.get("status") != "done":
            continue

        output_path = result.get("output_path", "")
        if not output_path or not os.path.exists(output_path):
            continue

        # Name format: 01_filename_8d.mp3
        base_name = result.get("filename", f"track_{i}")
        # Strip extension from base name
        base_name = Path(base_name).stem
        arcname = f"{i:02d}_{base_name}_8d.{output_format}"

        entries.append(
            {
                "path": output_path,
                "name": arcname,
            }
        )

    return build_zip(entries)
