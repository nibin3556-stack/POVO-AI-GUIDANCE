"""AI example notes request body."""
from typing import Optional

from pydantic import BaseModel, Field

from schema.calls import AssessmentCategory


class ExampleNotesRequest(BaseModel):
    call_id: Optional[str] = Field(default=None, max_length=64)
    participant_id: str = Field(min_length=1, max_length=64)
    category: AssessmentCategory
    point_text: Optional[str] = Field(default="", max_length=2000)
    #: The reception picked so far (0 not well, 1 moderately, 2 well); None when not rated.
    reception: Optional[int] = Field(default=None, ge=0, le=2)
