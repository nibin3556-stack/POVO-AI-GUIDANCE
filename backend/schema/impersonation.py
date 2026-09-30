"""Impersonation request bodies."""
from pydantic import BaseModel, Field


class ImpersonationStart(BaseModel):
    employee_id: str = Field(min_length=1, max_length=64)
