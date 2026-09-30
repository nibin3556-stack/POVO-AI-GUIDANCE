"""Compliance check request body."""
from typing import Optional

from pydantic import BaseModel, Field

from schema.calls import AssessmentCategory


class ComplianceCheckRequest(BaseModel):
    call_id: Optional[str] = Field(default=None, max_length=64)
    participant_id: str = Field(min_length=1, max_length=64)
    category: AssessmentCategory
    point_id: str = Field(min_length=1, max_length=64)
    point_text: Optional[str] = Field(default="", max_length=2000)
    note: str = Field(max_length=2000)
