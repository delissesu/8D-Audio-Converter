

import io
import zipfile
import os
from pathlib import Path

def build_zip(file_entries: list[dict]) -> io.BytesIO:

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

    entries = []

    for i, result in enumerate(results, start=1):
        if result.get("status") != "done":
            continue

        output_path = result.get("output_path", "")
        if not output_path or not os.path.exists(output_path):
            continue

        base_name = result.get("filename", f"track_{i}")

        base_name = Path(base_name).stem
        arcname = f"{i:02d}_{base_name}_8d.{output_format}"

        entries.append(
            {
                "path": output_path,
                "name": arcname,
            }
        )

    return build_zip(entries)
