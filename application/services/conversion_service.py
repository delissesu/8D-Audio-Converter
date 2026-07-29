import logging

import os

import tempfile

import threading

import uuid

from pathlib import Path

from domain.core import convert_to_8d

from domain.utils import DEFAULT_PARAMS

from infrastructure.web.file_cleanup import safe_delete, schedule_output_cleanup

from infrastructure.web.job_store import get_job, set_job, update_job

logger = logging.getLogger("8d_converter")

class JobProgressCallback:

    def __init__(self, job_id: str) -> None:

        self.job_id = job_id

    def on_step(self, step_idx: int, total_steps: int, step_name: str) -> None:

        progress = int((step_idx / total_steps) * 100)

        update_job(self.job_id, {"progress": progress, "step": step_name})

def run_conversion(job_id: str, input_path: str, output_path: str, params: dict, effect_chain: list | None = None) -> None:

    callback = JobProgressCallback(job_id)

    try:

        update_job(job_id, {"status": "processing"})

        convert_to_8d(
            input_path=input_path,
            output_path=output_path,
            pan_speed=params.get("speed", DEFAULT_PARAMS["speed"]),
            pan_depth=params.get("depth", DEFAULT_PARAMS["depth"]),
            room_size=params.get("room", DEFAULT_PARAMS["room"]),
            wet_level=params.get("wet", DEFAULT_PARAMS["wet"]),
            damping=params.get("damping", DEFAULT_PARAMS["damping"]),
            progress_callback=callback.on_step,
            effect_chain=effect_chain,
            trim_start=params.get("trim_start", 0.0),
            trim_end=params.get("trim_end", 0.0),
        )

        update_job(job_id, {
            "status": "done",
            "progress": 100,
            "output_path": os.path.realpath(output_path),
        })

        schedule_output_cleanup(output_path, delay_s=1800)

        logger.info("job=%s completed", job_id[:8])

    except Exception as error:

        update_job(job_id, {"status": "error", "error": str(error)})

        logger.error("job=%s failed: %s", job_id[:8], error)

        safe_delete(output_path)

    finally:

        safe_delete(input_path)

def create_conversion_job(input_path: str, out_format: str, params: dict, effect_chain: list | None) -> str:

    tmp_fd_out, tmp_out = tempfile.mkstemp(suffix=f".{out_format}")

    os.close(tmp_fd_out)

    job_id = str(uuid.uuid4())

    set_job(job_id, {
        "status": "queued",
        "progress": 0,
        "step": "Waiting to start",
        "output_path": os.path.realpath(tmp_out),
        "error": None,
    })

    thread = threading.Thread(
        target=run_conversion,
        args=(job_id, input_path, tmp_out, params, effect_chain),
        daemon=True,
    )

    thread.start()

    return job_id

def create_queued_job(input_path: str, out_format: str, params: dict, effect_chain: list | None) -> str:

    tmp_fd_out, tmp_out = tempfile.mkstemp(suffix=f".{out_format}")

    os.close(tmp_fd_out)

    job_id = str(uuid.uuid4())

    set_job(job_id, {
        "status": "queued",
        "progress": 0,
        "step": "Waiting to start",
        "output_path": os.path.realpath(tmp_out),
        "input_path": input_path,
        "params": params,
        "effect_chain": effect_chain,
        "error": None,
    })

    return job_id

def get_job_status(job_id: str) -> dict | None:

    job = get_job(job_id)

    if not job:

        return None

    return {
        "status": job["status"],
        "progress": job["progress"],
        "step": job["step"],
        "error": job["error"],
    }

def get_download_job(job_id: str) -> dict | None:

    return get_job(job_id)

def stem_for_download(filename: str) -> str:

    return Path(filename).stem
