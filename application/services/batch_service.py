import logging

import threading

import uuid

from application.services.conversion_service import create_queued_job, run_conversion

from infrastructure.web.batch_store import get_batch, set_batch, update_batch

from infrastructure.web.job_store import get_job, update_job

logger = logging.getLogger("8d_converter")

def run_batch_sequential(batch_id: str) -> None:

    batch = get_batch(batch_id)

    if not batch:

        return

    update_batch(batch_id, {"status": "processing"})

    for job_id in batch["job_ids"]:

        job = get_job(job_id)

        if not job:

            continue

        run_conversion(
            job_id=job_id,
            input_path=job.get("input_path"),
            output_path=job.get("output_path"),
            params=job.get("params", {}),
            effect_chain=job.get("effect_chain"),
        )

    update_batch(batch_id, {"status": "done"})

def create_batch(jobs: list[dict], out_format: str) -> tuple[str, list[str]]:

    batch_id = str(uuid.uuid4())

    job_ids = []

    filenames = []

    for job in jobs:

        job_id = create_queued_job(
            input_path=job["input_path"],
            out_format=out_format,
            params=job["params"],
            effect_chain=job["effect_chain"],
        )

        job_ids.append(job_id)

        filenames.append(job["filename"])

    set_batch(batch_id, {
        "job_ids": job_ids,
        "format": out_format,
        "filenames": filenames,
        "status": "processing",
    })

    thread = threading.Thread(target=run_batch_sequential, args=(batch_id,), daemon=True)

    thread.start()

    return batch_id, job_ids

def get_batch_status_data(batch_id: str) -> dict | None:

    batch = get_batch(batch_id)

    if not batch:

        return None

    jobs_info = []

    done_count = 0

    failed_count = 0

    for index, job_id in enumerate(batch["job_ids"]):

        job = get_job(job_id) or {}

        job_status = job.get("status", "unknown")

        if job_status == "done":

            done_count += 1

        elif job_status == "error":

            failed_count += 1

        jobs_info.append({
            "jobId": job_id,
            "filename": batch["filenames"][index] if index < len(batch["filenames"]) else "",
            "status": job_status,
            "progress": job.get("progress", 0),
            "step": job.get("step", ""),
            "error": job.get("error"),
        })

    return {
        "batchId": batch_id,
        "total": len(batch["job_ids"]),
        "done": done_count,
        "failed": failed_count,
        "status": batch["status"],
        "jobs": jobs_info,
    }

def get_batch_download_results(batch_id: str) -> tuple[dict | None, list[dict], bool]:

    batch = get_batch(batch_id)

    if not batch:

        return None, [], False

    results = []

    any_done = False

    for index, job_id in enumerate(batch["job_ids"]):

        job = get_job(job_id) or {}

        status = job.get("status", "unknown")

        if status == "done":

            any_done = True

        results.append({
            "filename": batch["filenames"][index] if index < len(batch["filenames"]) else f"track_{index + 1}",
            "output_path": job.get("output_path", ""),
            "status": status,
        })

    return batch, results, any_done
