"""Paging, sorting and filter parsing shared by the list endpoints.

Sorting is whitelist-only: `field:asc|desc`, where field must be one of the
endpoint's allowed keys (anything else is a 422, never passed anywhere).
"""
from __future__ import annotations

from typing import Callable, Optional

from fastapi import HTTPException

MAX_LIMIT = 200


def parse_sort(sort: Optional[str], allowed: tuple[str, ...], default: str) -> tuple[str, bool]:
    raw = (sort or default).strip()
    field, _, direction = raw.partition(":")
    direction = (direction or "asc").lower()
    if field not in allowed or direction not in ("asc", "desc"):
        raise HTTPException(status_code=422,
                            detail=f"Invalid sort '{raw}'. Use one of {', '.join(allowed)} with :asc or :desc")
    return field, direction == "desc"


def csv_set(value: Optional[str]) -> set[str]:
    return {v.strip() for v in (value or "").split(",") if v.strip()}


def sort_rows(rows: list[dict], key: Callable[[dict], object], desc: bool, tiebreak: Callable[[dict], object]):
    """Primary key in the chosen direction, then the fixed tie-break (always ascending)."""
    rows = sorted(rows, key=tiebreak)
    return sorted(rows, key=key, reverse=desc)


def page_slice(rows: list, page: int, limit: int) -> list:
    start = (page - 1) * limit
    return rows[start:start + limit]
