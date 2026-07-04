import hashlib
from dataclasses import dataclass
from typing import Any


def should_increment_count(is_first_response_from_user: bool) -> bool:
    return is_first_response_from_user


def is_line_eligible_for_user(
    transcription_count: int,
    user_already_responded: bool,
    target: int = 3,
) -> bool:
    return transcription_count < target and not user_already_responded


def mint_line_external_id(
    batch_external_id: str,
    page_external_id: str,
    line_index: int,
) -> str:
    key = f"{batch_external_id}:{page_external_id}:{line_index}"
    return hashlib.sha256(key.encode()).hexdigest()[:24]


@dataclass
class SessionLine:
    id: Any
    line_index: int
    bbox: dict
    polygon: dict | None
    transcription_count: int
    user_transcription: dict | None  # {"kind": ..., "text": ...} or None


def order_session_lines(lines: list[SessionLine], target: int = 3) -> list[dict]:
    sorted_lines = sorted(lines, key=lambda l: l.line_index)
    result = []
    for line in sorted_lines:
        user_already_responded = line.user_transcription is not None
        if user_already_responded:
            kind = line.user_transcription["kind"]
            status = "done_by_you" if kind == "text" else "flagged"
        elif line.transcription_count >= target:
            status = "full"
        else:
            status = "eligible"
        result.append({
            "id": line.id,
            "line_index": line.line_index,
            "bbox": line.bbox,
            "polygon": line.polygon,
            "transcription_count": line.transcription_count,
            "status": status,
            "prior_kind": line.user_transcription["kind"] if user_already_responded else None,
            "prior_text": line.user_transcription["text"] if user_already_responded else None,
        })
    return result
