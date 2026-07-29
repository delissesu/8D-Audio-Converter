from threading import Lock

from typing import Optional

_batches: dict[str, dict] = {}

_lock = Lock()

def get_batch(batch_id: str) -> Optional[dict]:

    with _lock:

        return _batches.get(batch_id)

def set_batch(batch_id: str, data: dict) -> None:

    with _lock:

        _batches[batch_id] = data

def update_batch(batch_id: str, updates: dict) -> None:

    with _lock:

        if batch_id in _batches:

            _batches[batch_id].update(updates)
