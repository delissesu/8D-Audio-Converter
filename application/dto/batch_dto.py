# application/dto/batch_dto.py
# Data Transfer Objects for batch conversion requests and results.

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ConversionRequestDTO:
    """Single file conversion request."""
    input_path: str
    output_path: str
    pan_speed: float = 0.15
    pan_depth: float = 1.0
    room_size: float = 0.4
    wet_level: float = 0.3
    damping: float = 0.5


@dataclass
class ConversionResultDTO:
    """Result for a single file conversion."""
    job_id: str
    filename: str
    status: str = "queued"       # queued | processing | done | error
    progress: int = 0
    step: str = "Waiting to start"
    error: Optional[str] = None
    output_path: Optional[str] = None


@dataclass
class BatchConversionRequestDTO:
    """Batch conversion request wrapping multiple single requests."""
    requests: List[ConversionRequestDTO] = field(default_factory=list)
    batch_id: str = ""
    format: str = "mp3"
    effect_ids: List[str] = field(default_factory=list)


@dataclass
class BatchConversionResultDTO:
    """Result for a batch conversion."""
    batch_id: str = ""
    results: List[ConversionResultDTO] = field(default_factory=list)
    failed_paths: List[str] = field(default_factory=list)
    total: int = 0
    done: int = 0
