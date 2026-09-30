"""Standard response envelope: EVERY endpoint returns this shape, errors included."""
from typing import Any, Optional

from pydantic import BaseModel


class ResponseSchema(BaseModel):
    data: Any = None
    status: int = 200
    message: str = "Success"
    page: Optional[int] = None
    limit: Optional[int] = None
    total_pages: Optional[int] = None
    total_items: Optional[int] = None


def ok(data: Any = None, message: str = "Success") -> dict:
    """The success envelope as a plain dict (FastAPI serialises dates/models)."""
    return ResponseSchema(data=data, message=message).model_dump()


def paged(items: list, page: int, limit: int, total: int) -> dict:
    total_pages = max(1, -(-total // limit)) if limit else 1
    return ResponseSchema(
        data=items, page=page, limit=limit, total_pages=total_pages, total_items=total
    ).model_dump()
