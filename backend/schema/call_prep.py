"""Call Prep request body."""
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["messaging", "objection", "closing"]


class CallPrepRequest(BaseModel):
    hcp_id: str = Field(min_length=1, max_length=64)
    participant_id: str = Field(min_length=1, max_length=64)
    category: Category
