import logging

import os

from threading import Timer

logger = logging.getLogger("8d_converter")

def safe_delete(path: str) -> None:

    try:

        if path and os.path.exists(path):

            os.unlink(path)

    except OSError as error:

        logger.warning("Could not delete %s: %s", path, error)

def schedule_output_cleanup(path: str, delay_s: int = 1800) -> None:

    Timer(delay_s, safe_delete, args=[path]).start()
