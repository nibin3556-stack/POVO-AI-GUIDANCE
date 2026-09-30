"""Calls and assessments request bodies.

Note length limits (200, 600 for the additional note) are enforced in the
endpoint so the message can name the point; the hard cap here stops abuse.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field

AssessmentCategory = Literal["messaging", "objection", "closing", "additional"]


class CallCreate(BaseModel):
    hcp_id: str = Field(min_length=1, max_length=64)
    participant_ids: list[str] = Field(default_factory=list, max_length=10)


class AssessmentIn(BaseModel):
    participant_id: str = Field(min_length=1, max_length=64)
    category: AssessmentCategory
    point_id: str = Field(min_length=1, max_length=64)
    point_rank: Optional[int] = Field(default=None, ge=0, le=20)
    point_text: Optional[str] = Field(default=None, max_length=2000)
    was_raised: bool = False
    reception: Optional[int] = Field(default=None, ge=0, le=2)
    note: Optional[str] = Field(default=None, max_length=2000)


class AssessmentBatch(BaseModel):
    items: list[AssessmentIn] = Field(max_length=100)
